import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'

export type GatewayConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'not_configured'

export interface GatewayStatusResponse {
  connected: boolean
  status: GatewayConnectionStatus
  protocol?: number | null
  reconnect_attempt?: number | null
}

export interface UseGatewayStatusReturn {
  status: GatewayConnectionStatus
  connected: boolean
  isLoading: boolean
  protocol: number | null
  reconnectAttempt: number
}

/**
 * Polls the gateway status endpoint every 10s.
 * In demo mode, short-circuits to not_configured without making API calls.
 */
export function useGatewayStatus(): UseGatewayStatusReturn {
  if (isDemoMode()) {
    return { status: 'not_configured', connected: false, isLoading: false, protocol: null, reconnectAttempt: 0 }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data, isLoading } = useQuery<GatewayStatusResponse>({
    queryKey: ['gateway', 'status'],
    queryFn: () => api.get<GatewayStatusResponse>('/api/gateway/status'),
    refetchInterval: 10_000,
    staleTime: 10_000,
    retry: 1,
  })

  return {
    status: data?.status ?? 'not_configured',
    connected: data?.connected ?? false,
    isLoading,
    protocol: data?.protocol ?? null,
    reconnectAttempt: data?.reconnect_attempt ?? 0,
  }
}
