import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { GatewayStatusResponse, GatewayConnectionStatus } from '@/pages/sessions/types'

interface UseGatewayStatusReturn {
  status: GatewayConnectionStatus
  connected: boolean
  isLoading: boolean
}

/**
 * Polls GET /api/gateway/status every 10s to track the OpenClaw Gateway
 * WebSocket connection state. Returns 'not_configured' in demo mode or
 * when the endpoint is unreachable.
 */
export function useGatewayStatus(): UseGatewayStatusReturn {
  const demo = isDemoMode()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.gatewayStatus,
    queryFn: () => api.get<GatewayStatusResponse>('/api/gateway/status'),
    refetchInterval: 10_000,
    staleTime: 10_000,
    enabled: !demo,
    retry: 1,
    // On network error, treat as not_configured rather than throwing
    meta: { suppressErrors: true },
  })

  if (demo) {
    return { status: 'not_configured', connected: false, isLoading: false }
  }

  return {
    status: data?.status ?? 'not_configured',
    connected: data?.connected ?? false,
    isLoading,
  }
}
