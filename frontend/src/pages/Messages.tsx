

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  MessageSquare, Send, RefreshCw, ArrowLeft, AlertCircle, User, Mic,
  Paperclip, X, Users, Search, Play, Pause, ChevronDown, CornerUpLeft, Copy, Check, SmilePlus,
} from 'lucide-react'

import { API_BASE, api } from '@/lib/api'

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
}

type ServiceFilter = 'all' | 'iMessage' | 'SMS'
type LightboxData = { src: string; type: 'image' | 'video' } | null

interface MessageMenuState {
  msgGuid: string
  msg: Message
  x: number
  y: number
  fromMe: boolean
}

interface ConvContextMenu {
  x: number
  y: number
  convGuid: string
  isUnread: boolean
}

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
  2000: '❤️', 2001: '👍', 2002: '👎',
  2003: '😂', 2004: '‼️', 2005: '❓',
}

const REACTION_NAMES: { key: string; emoji: string; type: number }[] = [
  { key: 'love', emoji: '❤️', type: 2000 },
  { key: 'like', emoji: '👍', type: 2001 },
  { key: 'dislike', emoji: '👎', type: 2002 },
  { key: 'laugh', emoji: '😂', type: 2003 },
  { key: 'emphasize', emoji: '‼️', type: 2004 },
  { key: 'question', emoji: '❓', type: 2005 },
]

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
// Matches anything.pluginPayloadAttachment and similar iMessage plugin junk
const PLUGIN_PAYLOAD_RE = /\S*\.pluginPayload\w*\r?\n?/gi
// Object replacement characters and other invisible iMessage garbage
const IMSG_JUNK_RE = /[\ufffc\ufffd\u2028\u2029\u200b]+/g

function cleanPayloadText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(PLUGIN_PAYLOAD_RE, '')
    .replace(IMSG_JUNK_RE, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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

function generateWaveformBars(seed: string, count = 32): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Array.from({ length: count }, (_, i) => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff
    const random = (hash % 100) / 100
    const envelope = Math.sin((i / count) * Math.PI) * 0.5 + 0.5
    return 0.12 + random * 0.88 * envelope
  })
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
          color: fromMe ? 'rgba(255,255,255,0.95)' : '#007aff',
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

/* ─── LinkPreviewCard — rich OG preview like iMessage ────────────────── */

const linkPreviewCache = new Map<string, { title: string; description: string; image: string; siteName: string }>()

function LinkPreviewCard({ url, fromMe }: { url: string; fromMe: boolean }) {
  const [meta, setMeta] = useState<{ title: string; description: string; image: string; siteName: string } | null>(
    linkPreviewCache.get(url) || null
  )
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (linkPreviewCache.has(url)) { setMeta(linkPreviewCache.get(url)!); return }
    let cancelled = false
    api.get<{ title: string; description: string; image: string; siteName: string; error?: string }>(`/api/messages/link-preview?url=${encodeURIComponent(url)}`)
      .then(data => {
        if (cancelled || data.error) return
        linkPreviewCache.set(url, data)
        setMeta(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [url])

  if (!meta) {
    // Fallback: just show domain
    let domain = ''
    try { domain = new URL(url).hostname.replace(/^www\./, '') } catch { return null }
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 10px', marginTop: '4px',
          background: fromMe ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
          borderRadius: '10px', textDecoration: 'none',
          border: fromMe ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--border)',
          maxWidth: '100%', overflow: 'hidden',
        }}
      >
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt=""
          style={{ width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <span style={{ fontSize: '11px', fontWeight: 600, color: fromMe ? 'rgba(255,255,255,0.8)' : 'var(--text-primary)' }}>
          {domain}
        </span>
      </a>
    )
  }

  const hasImage = meta.image && !imgError

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      style={{
        display: 'flex', flexDirection: 'column',
        marginTop: '4px', borderRadius: '12px', overflow: 'hidden',
        background: fromMe ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
        border: fromMe ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border)',
        textDecoration: 'none', maxWidth: '280px',
        transition: 'background 0.15s',
      }}
    >
      {/* OG Image */}
      {hasImage && (
        <img src={meta.image} alt="" style={{
          width: '100%', height: '140px', objectFit: 'cover', display: 'block',
        }} onError={() => setImgError(true)} />
      )}

      {/* Text content */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em',
          color: fromMe ? 'rgba(255,255,255,0.45)' : 'var(--text-muted)',
          marginBottom: '2px',
        }}>
          {meta.siteName}
        </div>
        {meta.title && (
          <div style={{
            fontSize: '12px', fontWeight: 600, lineHeight: 1.3,
            color: fromMe ? 'rgba(255,255,255,0.9)' : 'var(--text-primary)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {meta.title}
          </div>
        )}
        {meta.description && (
          <div style={{
            fontSize: '11px', lineHeight: 1.3, marginTop: '2px',
            color: fromMe ? 'rgba(255,255,255,0.55)' : 'var(--text-secondary)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {meta.description}
          </div>
        )}
      </div>
    </a>
  )
}

/* ─── ContactAvatar ─────────────────────────────────────────────────────── */

// Module-level avatar cache — persists across re-renders, cleared on page refresh
const avatarCache = new Map<string, 'ok' | 'miss'>()

// Batch-check which addresses have avatars (called once per conversation list load)
let batchCheckPromise: Promise<void> | null = null
function ensureAvatarBatchCheck(addresses: string[]) {
  const unchecked = addresses.filter(a => a && !avatarCache.has(a))
  if (unchecked.length === 0 || batchCheckPromise) return
  batchCheckPromise = api.post<{ available?: string[] }>('/api/messages/avatar', { addresses: unchecked })
    .then(data => {
      const available = new Set(data.available || [])
      for (const addr of unchecked) {
        avatarCache.set(addr, available.has(addr) ? 'ok' : 'miss')
      }
    })
    .catch(() => {
      // On failure, mark all as miss to avoid retry storm
      for (const addr of unchecked) avatarCache.set(addr, 'miss')
    })
    .finally(() => { batchCheckPromise = null })
}

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
    setPhotoUrl(null)
    if (!address) return
    // Skip fetch if we already know there's no avatar
    const cached = avatarCache.get(address)
    if (cached === 'miss') return

    let cancelled = false
    const url = `${API_BASE}/api/messages/avatar?address=${encodeURIComponent(address)}`
    const img = new Image()
    img.onload = () => {
      if (!cancelled) { setPhotoUrl(url); avatarCache.set(address, 'ok') }
    }
    img.onerror = () => {
      if (!cancelled) { setPhotoUrl(null); avatarCache.set(address, 'miss') }
    }
    img.src = url
    return () => { cancelled = true }
  }, [address])

  if (photoUrl) {
    return (
      <div style={{
        width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden',
      }}>
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

/* ─── GroupAvatar ─────────────────────────────────────────────────────────── */

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

/* ─── AudioWaveform ──────────────────────────────────────────────────────── */

function AudioWaveform({ src, fromMe, guid }: { src: string; fromMe: boolean; guid: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const animRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const bars = useMemo(() => generateWaveformBars(guid), [guid])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onMeta = () => setDuration(audio.duration)
    const onEnded = () => { setPlaying(false); setProgress(0) }
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  useEffect(() => {
    if (!playing) { cancelAnimationFrame(animRef.current); return }
    function tick() {
      const a = audioRef.current
      if (a && a.duration) setProgress(a.currentTime / a.duration)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [playing])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = x * a.duration
    setProgress(x)
  }

  const active = fromMe ? 'rgba(255,255,255,0.9)' : '#007aff'
  const dim = fromMe ? 'rgba(255,255,255,0.25)' : 'rgba(120,120,140,0.3)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', minWidth: '200px' }}>
      <button onClick={toggle} aria-label={playing ? 'Pause audio' : 'Play audio'} style={{
        width: '30px', height: '30px', borderRadius: '50%',
        background: fromMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,122,255,0.12)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: active, flexShrink: 0,
        transition: 'transform 0.15s var(--ease-spring)',
      }}>
        {playing ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: '2px' }} />}
      </button>
      <div onClick={seek} style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: '1.5px',
        height: '32px', cursor: 'pointer',
      }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: '3px', flexShrink: 0,
            height: `${h * 100}%`,
            borderRadius: '1.5px',
            background: i / bars.length <= progress ? active : dim,
            transition: 'background 0.1s',
          }} />
        ))}
      </div>
      <span style={{
        fontSize: '10px', minWidth: '30px', textAlign: 'right',
        color: fromMe ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {formatDuration(playing ? (audioRef.current?.currentTime || 0) : duration)}
      </span>
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  )
}

/* ─── ReactionPills ──────────────────────────────────────────────────────── */

function ReactionPills({ reactions, fromMe }: { reactions: Reaction[]; fromMe: boolean }) {
  if (!reactions || reactions.length === 0) return null

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
          padding: '2px 6px',
          fontSize: '12px', lineHeight: 1,
          animation: 'emojiPop 0.25s var(--ease-spring)',
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

/* ─── VideoThumbnail ─────────────────────────────────────────────────────── */

function VideoThumbnail({ src, br, onClick }: {
  src: string
  br: { topLeft: string; topRight: string; bottomRight: string; bottomLeft: string }
  onClick: () => void
}) {
  const radius = `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`
  const vidRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const v = vidRef.current
    if (!v) return
    const onLoaded = () => {
      if (v.duration > 0.5) v.currentTime = 0.5
      else v.currentTime = 0.01
    }
    const onSeeked = () => setReady(true)
    v.addEventListener('loadeddata', onLoaded)
    v.addEventListener('seeked', onSeeked)
    return () => {
      v.removeEventListener('loadeddata', onLoaded)
      v.removeEventListener('seeked', onSeeked)
    }
  }, [src])

  return (
    <div style={{ position: 'relative', cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); onClick() }}>
      <video
        ref={vidRef}
        src={src}
        preload="auto"
        muted
        playsInline
        style={{
          maxWidth: '280px', maxHeight: '320px', borderRadius: radius,
          display: ready ? 'block' : 'none',
        }}
      />
      {!ready && (
        <div style={{
          width: '240px', height: '160px', borderRadius: radius,
          background: 'linear-gradient(135deg, #1a1a2e, #2a2a3e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ready ? 'rgba(0,0,0,0.15)' : 'transparent',
        borderRadius: radius, pointerEvents: 'none',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            width: 0, height: 0,
            borderTop: '10px solid transparent', borderBottom: '10px solid transparent',
            borderLeft: '16px solid #333', marginLeft: '3px',
          }} />
        </div>
      </div>
    </div>
  )
}

/* ─── MessageMenu ────────────────────────────────────────────────────────── */

function MessageMenu({ x, y, msg, onReact, onReply, onCopy, onClose }: {
  x: number; y: number
  msg: Message
  onReact: (reaction: string) => void
  onReply: () => void
  onCopy: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const menuW = 280
  const clampedX = Math.max(8, Math.min(x - menuW / 2, window.innerWidth - menuW - 8))
  const clampedY = Math.max(8, y - 108)

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 998,
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'fadeIn 0.12s ease-out',
      }} />

      <div ref={ref} style={{
        position: 'fixed', left: clampedX, top: clampedY, zIndex: 999,
        display: 'flex', flexDirection: 'column', gap: '6px',
        animation: 'menuIn 0.2s var(--ease-spring)',
      }}>
        <div style={{
          background: 'rgba(30,30,38,0.85)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '28px',
          padding: '6px 8px',
          display: 'flex', gap: '2px',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
        }}>
          {REACTION_NAMES.map((r, i) => (
            <button
              key={r.key}
              onClick={() => onReact(r.key)}
              style={{
                background: 'transparent', border: 'none', borderRadius: '50%',
                width: '40px', height: '36px', fontSize: '22px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: `emojiPop 0.3s var(--ease-spring) ${i * 0.04}s both`,
                transition: 'transform 0.15s var(--ease-spring)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.35)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {r.emoji}
            </button>
          ))}
        </div>

        <div style={{
          background: 'rgba(30,30,38,0.85)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <MButton icon={<CornerUpLeft size={16} />} label="Reply" onClick={onReply} />
          {msg.text && <MButton icon={<Copy size={16} />} label="Copy" onClick={onCopy} />}
        </div>
      </div>
    </>
  )
}

function MButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        width: '100%', padding: '10px 14px',
        background: 'transparent', border: 'none',
        color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
        cursor: 'pointer', borderRadius: '8px',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
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
  const draftRef = useRef('')
  const [hasDraft, setHasDraft] = useState(false) // only tracks empty vs non-empty for send button
  const [sending, setSending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasMoreRef = useRef(true)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [lightbox, setLightbox] = useState<LightboxData>(null)
  const [loupe, setLoupe] = useState<{ x: number; y: number; zoom: number } | null>(null)
  const loupeRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const minZoomRef = useRef(0.5)
  const imgRef = useRef<HTMLImageElement>(null)

  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedConvs, setSelectedConvs] = useState<Set<string>>(new Set())
  const [convCtx, setConvCtx] = useState<ConvContextMenu | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const pendingScrollRef = useRef<'instant' | 'smooth' | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const selectedGuidRef = useRef<string | null>(null)

  // Notification toast with stacking
  const [toast, setToast] = useState<{ sender: string; text: string; chatGuid?: string; count: number } | null>(null)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

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

  /* ── Data fetching ── */

  const fetchConversations = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await api.get<{ conversations?: Conversation[]; contacts?: Record<string, string>; error?: string }>('/api/messages?limit=100')
      if (data.error) {
        if (!silent) setError(data.error)
      } else {
        const convs = data.conversations ?? []
        setConversations(convs)
        if (data.contacts) setContactLookup(prev => {
          const keys = Object.keys(data.contacts)
          if (keys.every(k => prev[k] === data.contacts[k])) return prev
          return { ...prev, ...data.contacts }
        })
        if (!silent) setError(null)
        // Batch-check avatars for all visible contacts
        const allAddresses = convs.flatMap((c: Conversation) =>
          (c.participants || []).map((p: { address: string }) => p.address).filter(Boolean)
        )
        if (allAddresses.length > 0) ensureAvatarBatchCheck(allAddresses)
      }
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const fetchMessages = useCallback(async (conv: Conversation, silent = false) => {
    try {
      if (!silent) setMsgsLoading(true)
      const data = await api.get<{ messages?: Message[]; contacts?: Record<string, string> }>(`/api/messages?conversation=${encodeURIComponent(conv.guid)}&limit=50`)
      // Guard: only apply if we're still viewing this conversation
      if (selectedGuidRef.current === conv.guid) {
        setMessages(data.messages ?? [])
        if (data.contacts) setContactLookup(prev => ({ ...prev, ...data.contacts }))
      }
    } catch {
      if (!silent && selectedGuidRef.current === conv.guid) setMessages([])
    } finally {
      if (!silent) setMsgsLoading(false)
    }
  }, [])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  useEffect(() => {
    if (selected) {
      const isSwitch = selectedGuidRef.current !== selected.guid
      selectedGuidRef.current = selected.guid
      if (isSwitch) {
        pendingScrollRef.current = 'instant'
        setReplyTo(null)
        hasMoreRef.current = true
        setAttachmentFile(null)
        setAttachmentPreview(null)
        draftRef.current = ''
        setHasDraft(false)
        if (inputRef.current) { inputRef.current.value = ''; inputRef.current.style.height = 'auto' }
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
  }, [selected, fetchMessages])

  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    const behavior = pendingScrollRef.current
    pendingScrollRef.current = null
    const grew = messages.length > prevMsgCountRef.current
    prevMsgCountRef.current = messages.length

    if (behavior) {
      scrollToBottom(behavior)
    } else if (grew && isNearBottomRef.current) {
      // Only auto-scroll when new messages are added, not on updates
      scrollToBottom('smooth')
    }
  }, [messages, scrollToBottom])

  // SSE
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 3000
    let sseConnected = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    function debouncedRefreshConvos() {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => fetchConversations(true), 2000)
    }

    function connect() {
      es = new EventSource(`${API_BASE}/api/messages/stream`)
      es.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data)
          if (event.type === 'connected') {
            sseConnected = true
            retryDelay = 3000
          } else if (event.type === 'new-message') {
            const msg = event.data
            const msgChats = msg.chats?.map((c: { guid: string }) => c.guid) ?? []
            if (selectedGuidRef.current && msgChats.includes(selectedGuidRef.current)) {
              setMessages(prev => {
                if (prev.some(m => m.guid === msg.guid)) return prev
                // Replace optimistic temp message if this is the real version
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
            // Notification for incoming messages
            if (!msg.isFromMe) {
              const senderAddr = msg.handle?.address || ''
              const preview = cleanPayloadText(msg.text).slice(0, 80) || 'New message'

              // Play notification chime
              try {
                const ctx = new AudioContext()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.type = 'sine'
                osc.frequency.setValueAtTime(880, ctx.currentTime)
                osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.08)
                osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.16)
                gain.gain.setValueAtTime(0.08, ctx.currentTime)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
                osc.start(ctx.currentTime)
                osc.stop(ctx.currentTime + 0.35)
              } catch { /* audio not available */ }

              // Browser notification (when tab not focused)
              if (typeof Notification !== 'undefined' && document.hidden && Notification.permission === 'granted') {
                new Notification(senderAddr, { body: preview, tag: 'mc-msg' })
              }

              // In-app toast — stack if same sender
              if (toastTimeout.current) clearTimeout(toastTimeout.current)
              setToast(prev => {
                if (prev && prev.sender === senderAddr) {
                  return { sender: senderAddr, text: preview, chatGuid: msgChats[0], count: prev.count + 1 }
                }
                return { sender: senderAddr, text: preview, chatGuid: msgChats[0], count: 1 }
              })
              toastTimeout.current = setTimeout(() => setToast(null), 4000)
            }
            debouncedRefreshConvos()
          } else if (event.type === 'updated-message') {
            const msg = event.data
            setMessages(prev => prev.map(m => m.guid === msg.guid ? { ...m, ...msg } : m))
          } else if (event.type === 'chat-read') {
            debouncedRefreshConvos()
          }
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        sseConnected = false
        es?.close()
        retryTimeout = setTimeout(connect, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30000)
      }
    }

    connect()
    const convPoll = setInterval(() => {
      if (!sseConnected) fetchConversations(true)
    }, 60000)

    return () => {
      es?.close()
      if (retryTimeout) clearTimeout(retryTimeout)
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(convPoll)
    }
  }, [fetchConversations])

  /* ── Lightbox / Loupe ── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightbox(null); setLoupe(null); setMessageMenu(null); setConvCtx(null) }
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

  const clearAttachment = useCallback(() => {
    if (attachmentPreview) URL.revokeObjectURL(attachmentPreview)
    setAttachmentFile(null)
    setAttachmentPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [attachmentPreview])

  const sendMessage = useCallback(async () => {
    const text = draftRef.current.trim()
    const file = attachmentFile
    if ((!text && !file) || !selected || sending) return
    const replyGuid = replyTo?.guid || null
    draftRef.current = ''
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.style.height = 'auto' }
    setHasDraft(false)
    setReplyTo(null)
    clearAttachment()
    setSending(true)
    pendingScrollRef.current = 'smooth'

    const optimistic: Message = {
      guid: `temp-${Date.now()}`,
      text: text || (file ? `Sending ${file.name}...` : ''),
      dateCreated: Date.now(),
      isFromMe: true,
      threadOriginatorGuid: replyGuid,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      if (file) {
        const formData = new FormData()
        formData.append('chatGuid', selected.guid)
        formData.append('attachment', file)
        if (text) formData.append('message', text)
        if (replyGuid) formData.append('selectedMessageGuid', replyGuid)
        await fetch(`${API_BASE}/api/messages/send-attachment`, { method: 'POST', body: formData })
      } else {
        await api.post('/api/messages', {
          chatGuid: selected.guid,
          text,
          ...(replyGuid ? { selectedMessageGuid: replyGuid } : {}),
        })
      }
      setTimeout(() => fetchMessages(selected, true), 2000)
    } catch {
      setMessages(prev => prev.filter(m => m.guid !== optimistic.guid))
      draftRef.current = text
      if (inputRef.current) inputRef.current.value = text
      setHasDraft(true)
    } finally {
      setSending(false)
    }
  }, [selected, sending, fetchMessages, replyTo, attachmentFile, clearAttachment])

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
    setConversations(prev => prev.map(c =>
      c.guid === convGuid ? { ...c, isUnread: markUnread } : c
    ))
    api.post('/api/messages/read', { chatGuid: convGuid, action: markUnread ? 'unread' : 'read' }).catch(() => {})
  }, [])

  const batchMarkReadStatus = useCallback(async (action: 'read' | 'unread') => {
    const guids = Array.from(selectedConvs)
    setConversations(prev => prev.map(c =>
      guids.includes(c.guid) ? { ...c, isUnread: action === 'unread' } : c
    ))
    Promise.allSettled(guids.map(guid =>
      api.post('/api/messages/read', { chatGuid: guid, action })
    ))
    setSelectedConvs(new Set())
    setSelectMode(false)
  }, [selectedConvs])

  const adjustTextarea = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`
  }, [])

  const handleDraftChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    draftRef.current = e.target.value
    const hasText = e.target.value.trim().length > 0
    setHasDraft(prev => prev !== hasText ? hasText : prev)
    adjustTextarea()
  }, [adjustTextarea])

  // Handle paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          setAttachmentFile(file)
          setAttachmentPreview(URL.createObjectURL(file))
        }
        return
      }
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachmentFile(file)
      setAttachmentPreview(URL.createObjectURL(file))
    }
  }, [])


  /* ── Filter ── */

  const filteredConversations = useMemo(() => conversations.filter(conv => {
    if (serviceFilter === 'iMessage' && !isIMessage(conv)) return false
    if (serviceFilter === 'SMS' && isIMessage(conv)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const name = contactLabel(conv).toLowerCase()
      const lastMsg = (conv.lastMessage || '').toLowerCase()
      return name.includes(q) || lastMsg.includes(q)
    }
    return true
  }), [conversations, serviceFilter, searchQuery])

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

  /* ── Error state ── */

  if (error) {
    return (
      <div style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Messages</h1>
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
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', gap: '0', overflow: 'hidden' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes menuIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes emojiPop {
          from { opacity: 0; transform: scale(0.3); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes lightboxIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes msgSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes replySlideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 80px; }
        }
        @keyframes scrollBtnIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes stickerWobble {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-3deg) scale(1.05); }
          50% { transform: rotate(2deg) scale(1.08); }
          75% { transform: rotate(-1deg) scale(1.03); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes ctxIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; }
          to { opacity: 0; transform: translateY(-10px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .msg-row .reply-hint {
          opacity: 0;
          transition: opacity 0.15s;
        }
        .msg-row:hover .reply-hint {
          opacity: 0.5;
        }
        .msg-row .reply-hint:hover {
          opacity: 1 !important;
          transform: scale(1.1);
        }
      `}</style>

      {/* ═══ Conversation list ═══ */}
      <div style={{
        width: selected ? '340px' : '100%',
        maxWidth: '420px',
        minWidth: selected ? '300px' : undefined,
        borderRight: selected ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.3s var(--ease-spring)',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={20} style={{ color: 'var(--accent)' }} />
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Messages</h1>
            {!loading && (
              <span className="badge badge-blue" style={{ marginLeft: '2px' }}>{conversations.length}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => {
                if (selectMode) { setSelectMode(false); setSelectedConvs(new Set()) }
                else setSelectMode(true)
              }}
              style={{
                background: selectMode ? 'rgba(0,122,255,0.15)' : 'transparent',
                border: '1px solid var(--border)', borderRadius: '8px',
                color: selectMode ? '#007aff' : 'var(--text-secondary)',
                padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 500,
              }}
            >
              {selectMode ? 'Done' : 'Edit'}
            </button>
            <button
              onClick={() => { fetchConversations(); if (selected) fetchMessages(selected) }}
              aria-label="Refresh"
              style={{
                background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px',
                color: 'var(--text-secondary)', padding: '6px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        <div style={{ padding: '10px 14px 6px', position: 'relative' }}>
          <Search size={13} style={{
            position: 'absolute', left: '26px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            type="text" placeholder="Search" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 34px', fontSize: '13px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', padding: '6px 14px 8px', borderBottom: '1px solid var(--border)' }}>
          {(['all', 'iMessage', 'SMS'] as ServiceFilter[]).map(f => {
            const act = serviceFilter === f
            const count = f === 'all' ? conversations.length
              : conversations.filter(c => f === 'iMessage' ? isIMessage(c) : !isIMessage(c)).length
            return (
              <button key={f} onClick={() => setServiceFilter(f)} style={{
                flex: 1, padding: '6px 8px', fontSize: '11px',
                fontWeight: act ? 600 : 450,
                color: act ? '#fff' : 'var(--text-secondary)',
                background: act
                  ? (f === 'iMessage' ? 'rgba(0,122,255,0.25)' : f === 'SMS' ? 'rgba(52,199,89,0.2)' : 'rgba(167,139,250,0.15)')
                  : 'transparent',
                border: act ? 'none' : '1px solid var(--border)',
                borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {f === 'all' ? 'All' : f} <span style={{ opacity: 0.6, fontSize: '10px' }}>{count}</span>
              </button>
            )
          })}
        </div>

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
            const isSel = selectedConvs.has(conv.guid)
            return (
              <button
                key={conv.guid}
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
                  }
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  setConvCtx({ x: e.clientX, y: e.clientY, convGuid: conv.guid, isUnread: !!conv.isUnread })
                }}
                style={{
                  width: '100%', position: 'relative',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 12px 12px 16px',
                  background: active ? 'rgba(167,139,250,0.12)' : isSel ? 'rgba(0,122,255,0.08)' : 'transparent',
                  border: 'none', borderRadius: '10px', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.15s', marginBottom: '2px',
                }}
                onMouseEnter={e => { if (!active && !isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!active && !isSel) e.currentTarget.style.background = 'transparent' }}
              >
                {selectMode && (
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    border: isSel ? 'none' : '2px solid var(--text-muted)',
                    background: isSel ? '#007aff' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s var(--ease-spring)',
                  }}>
                    {isSel && <Check size={13} color="#fff" strokeWidth={3} />}
                  </div>
                )}

                {!selectMode && conv.isUnread && (
                  <div style={{
                    position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)',
                    width: '8px', height: '8px', borderRadius: '50%', background: '#007aff',
                  }} />
                )}

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
                      fontSize: '13px', fontWeight: conv.isUnread ? 700 : 600,
                      color: active ? '#fff' : 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {contactLabel(conv)}
                    </span>
                    <span style={{
                      fontSize: '10px', color: conv.isUnread ? '#007aff' : 'var(--text-muted)',
                      fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
                    }}>
                      {timeAgo(conv.lastDate)}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: conv.isUnread ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: conv.isUnread ? 500 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginTop: '3px',
                  }}>
                    {conv.lastFromMe ? 'You: ' : ''}{cleanPayloadText(conv.lastMessage)}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {selectMode && selectedConvs.size > 0 && (
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
          </div>
        )}
      </div>

      {/* ═══ Message thread ═══ */}
      {selected ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <button
              onClick={() => { setSelected(null); setMessages([]); setMessageMenu(null); setReplyTo(null) }}
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
          </div>

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{
              flex: 1, overflowY: 'auto', padding: '16px 20px',
              display: 'flex', flexDirection: 'column', gap: '2px',
            }}
          >
            {loadingMore && (
              <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: '6px' }}>
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="19 19" strokeLinecap="round" />
                </svg>
                Loading older messages...
              </div>
            )}
            {msgsLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                Loading messages...
              </div>
            )}
            {!msgsLoading && messages.map((msg, idx) => {
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
                  <div key={msg.guid} style={{
                    textAlign: 'center', padding: '8px 0',
                    fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic',
                  }}>
                    {msg.groupTitle ? `Named the conversation "${msg.groupTitle}"` : 'Group updated'}
                  </div>
                )
              }

              return (
                <div key={msg.guid} style={{ animation: msg.guid.startsWith('temp-') ? 'msgSlideUp 0.2s var(--ease-spring)' : undefined }}>
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

                    <div data-msg-guid={msg.guid} style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column' }}>
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
                                      maxWidth: att.isSticker ? '160px' : '280px',
                                      maxHeight: att.isSticker ? '160px' : '320px',
                                      borderRadius: att.isSticker ? '4px' : `${br.topLeft} ${br.topRight} ${br.bottomRight} ${br.bottomLeft}`,
                                      display: 'block', cursor: 'zoom-in',
                                    }}
                                    loading="lazy"
                                    onClick={e => { e.stopPropagation(); setLightbox({ src, type: 'image' }) }}
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
                            {renderTextWithLinks(cleanText, fromMe)}
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

                  {fromMe && msg.guid.startsWith('temp-') && (
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
                      color: deliveryMarkers[msg.guid].startsWith('Read') ? 'var(--text-secondary)' : 'var(--text-muted)',
                      padding: '2px 4px 0',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: deliveryMarkers[msg.guid].startsWith('Read') ? 500 : 400,
                    }}>
                      {deliveryMarkers[msg.guid]}
                    </div>
                  )}
                </div>
              )
            })}
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
                : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="4" fill="#007aff" /></svg>
              }
              label={convCtx.isUnread ? 'Mark as Read' : 'Mark as Unread'}
              onClick={() => toggleReadStatus(convCtx.convGuid, !convCtx.isUnread)}
            />
          </div>
        </>
      )}

      {/* ═══ Lightbox ═══ */}
      {lightbox && (
        <div
          onClick={() => { setLightbox(null); setLoupe(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', animation: 'lightboxIn 0.2s ease-out',
          }}
        >
          {lightbox.type === 'image' ? (
            <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <img
                ref={imgRef} src={lightbox.src} alt="expanded"
                style={{
                  maxWidth: '85vw', maxHeight: '85vh', borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)', objectFit: 'contain',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)', display: 'block',
                  cursor: loupe ? 'none' : 'zoom-in', userSelect: 'none',
                }}
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  if (loupe) {
                    setLoupe(null)
                  } else {
                    setLoupe({ x: e.clientX - rect.left, y: e.clientY - rect.top, zoom: 2.1 })
                  }
                }}
                onMouseMove={e => {
                  if (!loupeRef.current) return
                  // Direct DOM update for smooth movement — no React re-render
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const y = e.clientY - rect.top
                  loupeRef.current = { ...loupeRef.current, x, y }
                  const el = document.getElementById('loupe-lens')
                  if (!el) return
                  const iw = rect.width
                  const ih = rect.height
                  const zoom = loupeRef.current.zoom
                  const lx = Math.max(LOUPE_W / 2, Math.min(iw - LOUPE_W / 2, x))
                  const ly = Math.max(LOUPE_H / 2, Math.min(ih - LOUPE_H / 2, y))
                  el.style.left = `${lx - LOUPE_W / 2}px`
                  el.style.top = `${ly - LOUPE_H / 2}px`
                  el.style.backgroundSize = `${iw * zoom}px ${ih * zoom}px`
                  el.style.backgroundPosition = `${LOUPE_W / 2 - x * zoom}px ${LOUPE_H / 2 - y * zoom}px`
                }}
              />
              {loupe && imgRef.current && (() => {
                const iw = imgRef.current.clientWidth
                const ih = imgRef.current.clientHeight
                minZoomRef.current = Math.max(LOUPE_W / iw, LOUPE_H / ih) / 0.85
                const lx = Math.max(LOUPE_W / 2, Math.min(iw - LOUPE_W / 2, loupe.x))
                const ly = Math.max(LOUPE_H / 2, Math.min(ih - LOUPE_H / 2, loupe.y))
                return (
                  <div id="loupe-lens" style={{
                    position: 'absolute', left: lx - LOUPE_W / 2, top: ly - LOUPE_H / 2,
                    width: LOUPE_W, height: LOUPE_H, borderRadius: '14px',
                    border: '2px solid rgba(255,255,255,0.35)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
                    backgroundImage: `url(${lightbox.src})`,
                    backgroundSize: `${iw * loupe.zoom}px ${ih * loupe.zoom}px`,
                    backgroundPosition: `${LOUPE_W / 2 - loupe.x * loupe.zoom}px ${LOUPE_H / 2 - loupe.y * loupe.zoom}px`,
                    backgroundRepeat: 'no-repeat', pointerEvents: 'none',
                    willChange: 'left, top, background-position, background-size',
                  }} />
                )
              })()}
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              <video
                src={lightbox.src}
                controls
                autoPlay
                playsInline
                style={{
                  maxWidth: '85vw', maxHeight: '85vh', display: 'block',
                  borderRadius: '10px', outline: 'none', background: '#000',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                }}
              />
            </div>
          )}
          <button
            onClick={() => { setLightbox(null); setLoupe(null) }}
            aria-label="Close lightbox"
            style={{
              position: 'fixed', top: '20px', right: '24px',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '36px', height: '36px', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* ═══ Toast notification ═══ */}
      {toast && (
        <div
          onClick={() => {
            if (toast.chatGuid) {
              const conv = conversations.find(c => c.guid === toast.chatGuid)
              if (conv) setSelected(conv)
            }
            setToast(null)
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
                  background: '#007aff', borderRadius: '8px',
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
        </div>
      )}
    </div>
  )
}
