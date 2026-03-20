import { useEffect, useState, useSyncExternalStore, memo } from 'react'
import { User, Users } from '@phosphor-icons/react'
import { API_BASE, api } from '@/lib/api'
import { LRUCache } from '@/lib/lru-cache'

/* ─── Constants ────────────────────────────────────────────────────────── */

/* intentionally hardcoded — fixed distinguishable palette for contact avatars */
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

/* ─── Module-level avatar cache (LRU, 500 entries) ───────────────────── */

const avatarCache = new LRUCache<string, 'ok' | 'miss'>(500)

// Reactive subscription so components re-render when batch check completes
let batchVersion = 0
const batchListeners = new Set<() => void>()
function subscribeBatch(cb: () => void) {
  batchListeners.add(cb)
  return () => { batchListeners.delete(cb) }
}
function getBatchVersion() { return batchVersion }
function notifyBatchDone() {
  batchVersion++
  batchListeners.forEach(cb => cb())
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
        avatarCache.set(addr, available.has(addr) ? 'ok' : 'miss')
      }
    })
    .catch(() => {
      // On failure, mark all as miss to avoid retry storm
      for (const addr of unchecked) avatarCache.set(addr, 'miss')
    })
    .finally(() => {
      batchCheckPromise = null
      notifyBatchDone()
    })
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

  // Re-render when the batch avatar check completes
  const version = useSyncExternalStore(subscribeBatch, getBatchVersion, getBatchVersion)

  useEffect(() => {
    setPhotoUrl(null)
    if (!address) return
    const cached = avatarCache.get(address)
    if (cached === 'miss') return

    // If a batch check is in flight and we don't have a cache entry yet,
    // wait for it rather than firing individual image loads that race.
    if (cached === undefined && batchCheckPromise) return

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
  }, [address, version])

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
        ? (isImsg ? 'linear-gradient(135deg, var(--apple-cyan), var(--apple-blue))' : 'linear-gradient(135deg, var(--apple-green), var(--apple-green))')
        : bgColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-on-color)',
    }}>
      {initial ? (
        <span style={{ fontSize: `${Math.round(size * 0.38)}px`, fontWeight: 700 }}>{initial}</span>
      ) : (
        <User size={Math.round(size * 0.48)} />
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
      background: 'linear-gradient(135deg, var(--tertiary), var(--accent-dim))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-on-color)',
    }}>
      <Users size={Math.round(size * 0.44)} />
    </div>
  )
})
