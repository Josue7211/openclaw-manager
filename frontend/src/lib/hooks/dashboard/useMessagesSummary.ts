import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode, DEMO_CONVERSATIONS } from '@/lib/demo-data'
import type { Conversation } from '@/pages/messages/types'

const MESSAGES_SUMMARY_KEY = ['messages-summary'] as const

interface MessagesSummaryConversation {
  guid: string
  displayName: string | null
  lastMessage: string | null
  lastDate: number | null
  hasUnread: boolean
}

export function useMessagesSummary() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ conversations?: Conversation[]; contacts?: Record<string, string> }>({
    queryKey: MESSAGES_SUMMARY_KEY,
    queryFn: () => api.get<{ conversations?: Conversation[]; contacts?: Record<string, string> }>('/api/messages?limit=5'),
    refetchInterval: 60_000,
    enabled: !_demo,
  })

  const rawConversations = _demo
    ? DEMO_CONVERSATIONS.map(c => ({
        guid: c.guid,
        displayName: c.displayName,
        lastMessage: c.lastMessage,
        lastDate: c.lastDate,
        hasUnread: c.lastFromMe === 0,
      }))
    : (data?.conversations ?? []).map((c: Conversation) => ({
        guid: c.guid,
        displayName: c.displayName || c.chatId || c.participants?.[0]?.address || c.guid,
        lastMessage: c.lastMessage,
        lastDate: c.lastDate,
        hasUnread: !!c.isUnread,
      }))

  const conversations: MessagesSummaryConversation[] = useMemo(
    () => rawConversations.slice(0, 5),
    [rawConversations],
  )

  const unreadCount = useMemo(
    () => rawConversations.filter((c: MessagesSummaryConversation) => c.hasUnread).length,
    [rawConversations],
  )

  return { conversations, unreadCount, mounted: _demo || isSuccess }
}
