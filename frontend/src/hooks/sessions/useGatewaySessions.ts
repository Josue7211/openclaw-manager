import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { ClaudeSession, SessionListResponse, GatewaySessionsResponse } from '@/pages/sessions/types'

type DataSource = 'gateway' | 'cli' | 'none'

interface UseGatewaySessionsReturn {
  sessions: ClaudeSession[]
  available: boolean
  isLoading: boolean
  source: DataSource
}

/**
 * Fetches sessions with a two-tier strategy:
 * 1. Try GET /api/gateway/sessions (real-time gateway WS data)
 * 2. Fall back to GET /api/claude-sessions (CLI-based)
 *
 * When both fail or return empty, the page shows "No active sessions"
 * instead of infinite loading.
 */
export function useGatewaySessions(): UseGatewaySessionsReturn {
  const demo = isDemoMode()

  // Primary: gateway sessions
  const gateway = useQuery({
    queryKey: queryKeys.gatewaySessions,
    queryFn: async () => {
      const res = await api.get<GatewaySessionsResponse>('/api/gateway/sessions')
      return res
    },
    refetchInterval: demo ? false : 5_000,
    staleTime: 5_000,
    enabled: !demo,
    retry: 0,
  })

  // Fallback: existing CLI-based sessions
  // Only enabled when gateway query has errored
  const gatewayFailed = gateway.isError || (gateway.data && !Array.isArray(gateway.data?.sessions))
  const fallback = useQuery({
    queryKey: queryKeys.claudeSessions,
    queryFn: () => api.get<SessionListResponse>('/api/claude-sessions'),
    refetchInterval: demo ? false : 5_000,
    enabled: !demo && !!gatewayFailed,
    retry: 1,
  })

  if (demo) {
    return { sessions: [], available: false, isLoading: false, source: 'none' }
  }

  // Gateway succeeded with data
  if (gateway.data?.sessions && !gateway.isError) {
    return {
      sessions: gateway.data.sessions,
      available: true,
      isLoading: false,
      source: 'gateway',
    }
  }

  // Gateway loading (first fetch)
  if (gateway.isLoading) {
    return {
      sessions: [],
      available: true,
      isLoading: true,
      source: 'none',
    }
  }

  // Gateway failed, using fallback
  if (fallback.data) {
    return {
      sessions: fallback.data.sessions ?? [],
      available: fallback.data.available !== false,
      isLoading: false,
      source: 'cli',
    }
  }

  // Fallback still loading
  if (fallback.isLoading) {
    return {
      sessions: [],
      available: true,
      isLoading: true,
      source: 'none',
    }
  }

  // Both failed
  return {
    sessions: [],
    available: false,
    isLoading: false,
    source: 'none',
  }
}
