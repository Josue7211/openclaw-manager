import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { ensureAvatarBatchCheck } from '@/components/messages/ContactAvatar'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'

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

type ServiceFilter = 'all' | 'iMessage' | 'SMS'

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

export function useConversationList() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contactLookup, setContactLookup] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [showJunk, setShowJunk] = useState(false)
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false)
  const hasMoreConvsRef = useRef(true)
  const convListRef = useRef<HTMLDivElement>(null)

  const [mutedConvs, setMutedConvs] = useLocalStorageState<string[]>('muted-conversations', [])
  const [pinnedConvs, setPinnedConvs] = useLocalStorageState<string[]>('pinned-conversations', [])

  const fetchConversations = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const junkParam = showJunk ? 'junk' : 'all'
      const data = await api.get<{ conversations?: Conversation[]; contacts?: Record<string, string>; error?: string }>(`/api/messages?limit=25&filter=${junkParam}`)
      if (data.error) {
        if (!silent) setError(data.error)
      } else {
        const convs = data.conversations ?? []
        setConversations(convs)
        hasMoreConvsRef.current = convs.length >= 25
        if (data.contacts) setContactLookup(prev => {
          const keys = Object.keys(data.contacts!)
          if (keys.every(k => prev[k] === data.contacts![k])) return prev
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
      if (!silent) setError(e instanceof ApiError ? e.serviceLabel : e instanceof Error ? e.message : 'BlueBubbles unreachable')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [showJunk])

  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConvs || !hasMoreConvsRef.current) return
    setLoadingMoreConvs(true)
    try {
      const offset = conversations.length
      const junkParam = showJunk ? 'junk' : 'all'
      const data = await api.get<{ conversations?: Conversation[]; contacts?: Record<string, string> }>(`/api/messages?limit=25&offset=${offset}&filter=${junkParam}`)
      const more = data.conversations ?? []
      if (more.length < 25) hasMoreConvsRef.current = false
      if (more.length > 0) {
        setConversations(prev => {
          const existingGuids = new Set(prev.map(c => c.guid))
          const fresh = more.filter((c: Conversation) => !existingGuids.has(c.guid))
          return fresh.length > 0 ? [...prev, ...fresh] : prev
        })
      }
      if (data.contacts) setContactLookup(prev => ({ ...prev, ...data.contacts }))
    } catch { /* best-effort */ }
    setLoadingMoreConvs(false)
  }, [conversations.length, loadingMoreConvs, showJunk])

  const handleConvListScroll = useCallback(() => {
    const el = convListRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      loadMoreConversations()
    }
  }, [loadMoreConversations])

  // Initial fetch
  useEffect(() => { fetchConversations() }, [fetchConversations])

  const filteredConversations = useMemo(() => {
    const filtered = conversations.filter(conv => {
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

    const pinnedSet = new Set(pinnedConvs)
    const pinned = filtered.filter(c => pinnedSet.has(c.guid))
    const unpinned = filtered.filter(c => !pinnedSet.has(c.guid))
    // Both groups already sorted by lastDate from the API; keep that order
    return [...pinned, ...unpinned]
  }, [conversations, serviceFilter, searchQuery, pinnedConvs])

  return {
    conversations,
    setConversations,
    contactLookup,
    setContactLookup,
    loading,
    error,
    setError,
    searchQuery,
    setSearchQuery,
    serviceFilter,
    setServiceFilter,
    showJunk,
    setShowJunk,
    loadingMoreConvs,
    convListRef,
    filteredConversations,
    fetchConversations,
    loadMoreConversations,
    handleConvListScroll,
    mutedConvs,
    setMutedConvs,
    pinnedConvs,
    setPinnedConvs,
  }
}
