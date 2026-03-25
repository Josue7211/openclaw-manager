import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import type { ClaudeSession, GatewaySessionsResponse } from '@/pages/sessions/types'

interface UseGatewaySessionsReturn {
  sessions: ClaudeSession[]
  available: boolean
  isLoading: boolean
}

/**
 * Fetches all sessions from the OpenClaw gateway via GET /api/gateway/sessions.
 * Sessions are sorted by lastActivity descending (newest first).
 * Real-time updates arrive via SSE 'chat' events which invalidate the query.
 *
 * Returns empty array and available:false in demo mode without calling API.
 */
export function useGatewaySessions(): UseGatewaySessionsReturn {
  const demo = isDemoMode()

  // Real-time session updates via gateway SSE — must be called unconditionally (React rules)
  // Pass undefined in demo mode to disable without violating hook ordering rules
  useGatewaySSE(demo ? undefined : {
    events: ['chat'],
    queryKeys: {
      chat: queryKeys.gatewaySessions,
    },
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.gatewaySessions,
    queryFn: () => api.get<GatewaySessionsResponse>('/api/gateway/sessions'),
    refetchInterval: demo ? false : 5_000,
    staleTime: 5_000,
    enabled: !demo,
    retry: 0,
  })

  if (demo) {
    return { sessions: [], isLoading: false, available: false }
  }

  const sessions = (data?.sessions ?? []).slice().sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  )

  return {
    sessions,
    isLoading,
    available: !isError,
  }
}
