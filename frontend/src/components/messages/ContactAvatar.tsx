import { useEffect, useState, memo } from 'react'
import { User, Users } from 'lucide-react'
import { API_BASE, api } from '@/lib/api'

/* ─── Constants ────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#85C1E9', '#F8C471', '#82E0AA', '#F1948A',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#01A3A4',
]

/* ─── Utilities ────────────────────────────────────────────────────────── */

function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

/* ─── Module-level avatar cache ──────────────────────────────────────── */

const avatarCache = new Map<string, 'ok' | 'miss'>()
const MAX_AVATAR_CACHE = 500

function avatarCacheSet(key: string, value: 'ok' | 'miss') {
  if (avatarCache.size >= MAX_AVATAR_CACHE && !avatarCache.has(key)) {
    const oldest = avatarCache.keys().next().value
    if (oldest !== undefined) avatarCache.delete(oldest)
  }
  avatarCache.set(key, value)
}

// Batch-check which addresses have avatars (called once per conversation list load)
let batchCheckPromise: Promise<void> | null = null

export function ensureAvatarBatchCheck(addresses: string[]) {
  const unchecked = addresses.filter(a => a && !avatarCache.has(a))
  if (unchecked.length === 0 || batchCheckPromise) return
  batchCheckPromise = api.post<{ available?: string[] }>('/api/messages/avatar', { addresses: unchecked })
    .then(data => {
      const available = new Set(data.available || [])
      for (const addr of unchecked) {
        avatarCacheSet(addr, available.has(addr) ? 'ok' : 'miss')
      }
    })
    .catch(() => {
      // On failure, mark all as miss to avoid retry storm
      for (const addr of unchecked) avatarCacheSet(addr, 'miss')
    })
    .finally(() => { batchCheckPromise = null })
}

/* ─── Types used locally ─────────────────────────────────────────────── */

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

/* ─── ContactAvatar ─────────────────────────────────────────────────────── */

export const ContactAvatar = memo(function ContactAvatar({ address, name, isImsg, size = 40 }: {
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
      if (!cancelled) { setPhotoUrl(url); avatarCacheSet(address, 'ok') }
    }
    img.onerror = () => {
      if (!cancelled) { setPhotoUrl(null); avatarCacheSet(address, 'miss') }
    }
    img.src = url
    return () => { cancelled = true }
  }, [address])

  if (photoUrl) {
    return (
      <div style={{
        width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px`,
        borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      }}>
        <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }

  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px`,
      borderRadius: '50%', flexShrink: 0,
      background: isImsg !== undefined
        ? (isImsg ? 'linear-gradient(135deg, var(--apple-cyan), var(--apple-blue))' : 'linear-gradient(135deg, var(--apple-green), #30b04e)')
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
})

/* ─── GroupAvatar ─────────────────────────────────────────────────────────── */

function isIMessage(conv: Conversation): boolean {
  const svc = conv.service?.toLowerCase() || ''
  const guidLower = conv.guid?.toLowerCase() || ''
  if (svc.includes('imessage') || guidLower.startsWith('imessage')) return true
  if (svc === 'any' || guidLower.startsWith('any;')) {
    const hasExplicitSms = conv.participants?.some(p => p.service?.toLowerCase() === 'sms')
    if (!hasExplicitSms) return true
  }
  if (conv.participants?.length > 1 &&
    conv.participants.every(p => {
      const ps = p.service?.toLowerCase() || ''
      return ps.includes('imessage') || ps === 'any'
    })) return true
  return false
}

export const GroupAvatar = memo(function GroupAvatar({ conv, size = 40 }: { conv: Conversation; size?: number }) {
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
})
