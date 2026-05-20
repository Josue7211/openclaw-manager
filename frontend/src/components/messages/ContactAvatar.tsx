import { useEffect, useState, useSyncExternalStore, memo } from 'react'
import { User, Users } from '@phosphor-icons/react'
import { api, getRequestApiKeyForPath, getRequestBaseForPath } from '@/lib/api'
import { LRUCache } from '@/lib/lru-cache'
import { isIMessage } from '@/features/messages/utils'
import type { Conversation } from '@/features/messages/types'

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

type AvatarEntry =
  | { status: 'ready'; url: string }
  | { status: 'loading'; promise: Promise<string | null> }
  | { status: 'miss'; at: number }

const avatarCache = new LRUCache<string, AvatarEntry>(500)
const AVATAR_STORAGE = 'clawctrl-message-avatars-v2'
const AVATAR_MISS_TTL_MS = 30_000

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

function cachedReadyUrl(cacheKey: string | null): string | null {
  if (!cacheKey) return null
  const cached = avatarCache.get(cacheKey)
  return cached?.status === 'ready' ? cached.url : null
}

async function readStoredAvatar(path: string): Promise<string | null> {
  if (!('caches' in window)) return null
  try {
    const cache = await caches.open(AVATAR_STORAGE)
    const res = await cache.match(path)
    if (!res?.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}

async function writeStoredAvatar(path: string, blob: Blob) {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(AVATAR_STORAGE)
    await cache.put(path, new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
        'Cache-Control': 'max-age=86400',
      },
    }))
  } catch {
    // Best-effort desktop cache.
  }
}

function contactPath(address: string) {
  return `/api/messages/avatar?address=${encodeURIComponent(address)}`
}

function chatPath(guid: string) {
  return `/api/messages/avatar?chatGuid=${encodeURIComponent(guid)}`
}

function loadAvatar(path: string | null, cacheKey: string | null): Promise<string | null> {
  if (!path || !cacheKey) return Promise.resolve(null)
  const cached = avatarCache.get(cacheKey)
  if (cached?.status === 'ready') return Promise.resolve(cached.url)
  if (cached?.status === 'miss' && Date.now() - cached.at < AVATAR_MISS_TTL_MS) {
    return Promise.resolve(null)
  }
  if (cached?.status === 'loading') return cached.promise

  const promise = (async () => {
    const stored = await readStoredAvatar(path)
    if (stored) {
      avatarCache.set(cacheKey, { status: 'ready', url: stored })
      notifyBatchDone()
      return stored
    }

    const headers: Record<string, string> = {}
    const apiKey = getRequestApiKeyForPath(path)
    if (apiKey) headers['X-API-Key'] = apiKey

    try {
      const res = await fetch(`${getRequestBaseForPath(path)}${path}`, { headers })
      if (!res.ok) throw new Error(`avatar ${res.status}`)
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) throw new Error(`avatar content-type ${blob.type || 'unknown'}`)
      const url = URL.createObjectURL(blob)
      avatarCache.set(cacheKey, { status: 'ready', url })
      void writeStoredAvatar(path, blob)
      notifyBatchDone()
      return url
    } catch {
      avatarCache.set(cacheKey, { status: 'miss', at: Date.now() })
      notifyBatchDone()
      return null
    }
  })()

  avatarCache.set(cacheKey, { status: 'loading', promise })
  return promise
}

function preloadAvatar(path: string | null, cacheKey: string | null) {
  if (!path || !cacheKey) return
  void loadAvatar(path, cacheKey)
}

// Batch-check and preload avatars (called once per conversation list load)
let batchCheckPromise: Promise<void> | null = null
const batchCheckedAddresses = new Set<string>()

export function ensureAvatarBatchCheck(addresses: string[]) {
  const unique = Array.from(new Set(addresses.filter(Boolean)))
  unique.slice(0, 80).forEach(addr => preloadAvatar(contactPath(addr), addr))
  const unchecked = unique.filter(a => !avatarCache.has(a) && !batchCheckedAddresses.has(a))
  if (unchecked.length === 0 || batchCheckPromise) return
  batchCheckPromise = api.post<{ available?: string[] }>('/api/messages/avatar', { addresses: unchecked })
    .then(data => {
      const available = new Set(data.available || [])
      for (const addr of unchecked) {
        batchCheckedAddresses.add(addr)
        if (available.has(addr)) preloadAvatar(contactPath(addr), addr)
      }
    })
    .catch(() => {
      for (const addr of unchecked) batchCheckedAddresses.add(addr)
    })
    .finally(() => {
      batchCheckPromise = null
      notifyBatchDone()
    })
}

/* ─── Types used locally ─────────────────────────────────────────────── */

export function ensureConversationAvatarPreload(conversations: Conversation[]) {
  conversations.slice(0, 80).forEach(conv => {
    if (conv.participants?.length > 1 && conv.guid) {
      preloadAvatar(chatPath(conv.guid), `chat:${conv.guid}`)
    }
    for (const participant of conv.participants || []) {
      if (participant.address) preloadAvatar(contactPath(participant.address), participant.address)
    }
    if (conv.chatId && (!conv.participants || conv.participants.length <= 1)) {
      preloadAvatar(contactPath(conv.chatId), conv.chatId)
    }
  })
}

function useAvatarPhoto(path: string | null, cacheKey: string | null, version = 0) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => cachedReadyUrl(cacheKey))

  useEffect(() => {
    let cancelled = false
    const ready = cachedReadyUrl(cacheKey)
    if (ready) {
      setPhotoUrl(ready)
      return () => { cancelled = true }
    }
    setPhotoUrl(null)
    if (!path || !cacheKey) {
      return () => { cancelled = true }
    }

    void loadAvatar(path, cacheKey).then(url => {
      if (!cancelled && url) setPhotoUrl(url)
    })
    return () => { cancelled = true }
  }, [path, cacheKey, version])

  return photoUrl
}

/* ─── ContactAvatar ─────────────────────────────────────────────────────── */

export const ContactAvatar = memo(function ContactAvatar({ address, name, isImsg, size = 40 }: {
  address: string
  name?: string | null
  isImsg?: boolean
  size?: number
}) {
  const hasSavedName = !!name
  const initial = hasSavedName ? name!.charAt(0).toUpperCase() : null
  const bgColor = hashColor(address || name || 'default')

  // Re-render when the batch avatar check completes
  const version = useSyncExternalStore(subscribeBatch, getBatchVersion, getBatchVersion)
  const path = address ? contactPath(address) : null
  const photoUrl = useAvatarPhoto(path, address || null, version)

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

export const GroupAvatar = memo(function GroupAvatar({ conv, size = 40 }: { conv: Conversation; size?: number }) {
  const version = useSyncExternalStore(subscribeBatch, getBatchVersion, getBatchVersion)
  const path = conv.guid ? chatPath(conv.guid) : null
  const groupPhotoUrl = useAvatarPhoto(path, conv.guid ? `chat:${conv.guid}` : null, version)
  if (groupPhotoUrl) {
    return (
      <div style={{
        width: `${size}px`, height: `${size}px`, minWidth: `${size}px`, minHeight: `${size}px`,
        borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      }}>
        <img src={groupPhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }

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

  if (parts.length === 3) {
    const large = Math.round(size * 0.68)
    const small = Math.round(size * 0.5)
    return (
      <div style={{ width: `${size}px`, height: `${size}px`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: Math.round(size * 0.15), left: 0 }}>
          <ContactAvatar address={parts[0].address} size={large} />
        </div>
        <div style={{ position: 'absolute', top: 0, right: 0, border: '2px solid var(--bg-panel)', borderRadius: '50%' }}>
          <ContactAvatar address={parts[1].address} size={small} />
        </div>
        <div style={{ position: 'absolute', bottom: 0, right: 0, border: '2px solid var(--bg-panel)', borderRadius: '50%' }}>
          <ContactAvatar address={parts[2].address} size={small} />
        </div>
      </div>
    )
  }

  if (parts.length >= 4) {
    const s = Math.round(size * 0.52)
    const visible = parts.slice(0, 4)
    return (
      <div style={{ width: `${size}px`, height: `${size}px`, position: 'relative', flexShrink: 0 }}>
        {visible.map((part, index) => {
          const x = index % 2 === 0 ? 0 : size - s
          const y = index < 2 ? 0 : size - s
          return (
            <div
              key={`${part.address}-${index}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                border: '1.5px solid var(--bg-panel)',
                borderRadius: '50%',
                overflow: 'hidden',
              }}
            >
              <ContactAvatar address={part.address} size={s} />
            </div>
          )
        })}
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
