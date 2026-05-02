import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { queryKeys } from '@/lib/query-keys'

export type HarnessConnectionStatus = 'connected' | 'disconnected' | 'not_configured'

interface HarnessHealthResponse {
  ok: boolean
  status?: string
  provider?: string
  platform?: string
}

export interface UseHarnessStatusReturn {
  status: HarnessConnectionStatus
  connected: boolean
  isLoading: boolean
  providerLabel: string
}

function normalizeProviderLabel(value?: string): string {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) return 'Harness'
  if (raw === 'hermes-openclaw-compat' || raw === 'hermes-agent' || raw === 'hermes') {
    return 'Hermes Agent'
  }
  if (raw === 'openclaw') {
    return 'OpenClaw'
  }
  return (value ?? 'Harness').trim()
}

export function useHarnessStatus(): UseHarnessStatusReturn {
  if (isDemoMode()) {
    return { status: 'not_configured', connected: false, isLoading: false, providerLabel: 'Harness' }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data, isLoading } = useQuery<HarnessHealthResponse>({
    queryKey: queryKeys.health,
    queryFn: () => api.get<HarnessHealthResponse>('/api/openclaw/health'),
    refetchInterval: 10_000,
    staleTime: 10_000,
    retry: 1,
  })
  const providerLabel = normalizeProviderLabel(data?.provider ?? data?.platform)

  if (data?.ok) {
    return { status: 'connected', connected: true, isLoading, providerLabel }
  }

  if (data?.status === 'not_configured') {
    return { status: 'not_configured', connected: false, isLoading, providerLabel }
  }

  return { status: 'disconnected', connected: false, isLoading, providerLabel }
}
