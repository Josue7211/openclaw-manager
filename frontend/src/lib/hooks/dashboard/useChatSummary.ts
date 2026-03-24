import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { queryKeys } from '@/lib/query-keys'
import type { ChatMessage } from '@/pages/chat/types'

interface ChatThread {
  id: string
  title: string
  model: string
  updatedAt: string
}

// The chat system uses a single-thread history endpoint at /api/chat/history.
// There is no multi-thread listing endpoint yet, so we derive a single "thread"
// summary from the latest messages in the current conversation.

const DEMO_THREADS: ChatThread[] = [
  { id: 'demo-thread-1', title: 'Getting started with OpenClaw', model: 'claude-sonnet-4-6', updatedAt: new Date(Date.now() - 300_000).toISOString() },
  { id: 'demo-thread-2', title: 'Homelab architecture review', model: 'claude-opus-4-6', updatedAt: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'demo-thread-3', title: 'Debugging WebSocket issues', model: 'claude-haiku-4-5', updatedAt: new Date(Date.now() - 86_400_000).toISOString() },
]

export function useChatSummary() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ messages?: ChatMessage[] }>({
    queryKey: queryKeys.chatHistory,
    queryFn: () => api.get<{ messages?: ChatMessage[] }>('/api/chat/history'),
    refetchInterval: 60_000,
    enabled: !_demo,
  })

  const threads: ChatThread[] = useMemo(() => {
    if (_demo) return DEMO_THREADS

    const messages = data?.messages ?? []
    if (messages.length === 0) return []

    // Derive a single thread summary from the latest messages
    const lastMsg = messages[messages.length - 1]
    const firstUserMsg = messages.find(m => m.role === 'user')
    const title = firstUserMsg
      ? firstUserMsg.text.slice(0, 60) + (firstUserMsg.text.length > 60 ? '...' : '')
      : 'Chat session'

    return [{
      id: 'current',
      title,
      model: 'AI',
      updatedAt: lastMsg?.timestamp ?? new Date().toISOString(),
    }]
  }, [_demo, data?.messages])

  const totalCount = threads.length

  return { threads, totalCount, mounted: _demo || isSuccess }
}
