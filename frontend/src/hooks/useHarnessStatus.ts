import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { queryKeys } from '@/lib/query-keys'

export type HarnessConnectionStatus = 'connected' | 'disconnected' | 'not_configured'

export interface HarnessServiceState {
  configured?: boolean
  reachable?: boolean
  status?: 'connected' | 'not_configured' | 'auth_missing' | 'auth_invalid' | 'auth_probe_missing' | 'unreachable' | string
  auth_configured?: boolean
  auth_valid?: boolean
  auth_source?: 'api_key' | 'password_fallback' | 'missing' | string
  checked_path?: string | null
  message?: string | null
}

interface HarnessHealthResponse {
  services?: {
    harness?: HarnessServiceState
  }
}

export interface UseHarnessStatusReturn {
  status: HarnessConnectionStatus
  connected: boolean
  isLoading: boolean
  providerLabel: string
  detail?: string
}

function detailForService(service?: HarnessServiceState): string | undefined {
  if (!service) return undefined
  const message = service.message?.trim()
  const checkedPath = service.checked_path?.trim()
  if (message && checkedPath) return `${message} Checked ${checkedPath}.`
  if (message) return message
  if (service.status === 'auth_missing') return 'Harness auth is missing.'
  if (service.status === 'auth_invalid') return 'Harness rejected the configured auth token.'
  if (service.status === 'auth_probe_missing') return 'No authenticated harness route was available to verify.'
  return undefined
}

export function useHarnessStatus(): UseHarnessStatusReturn {
  const demoMode = isDemoMode()

  const { data, isLoading } = useQuery<HarnessHealthResponse>({
    queryKey: queryKeys.harnessHealth,
    queryFn: () => api.get<HarnessHealthResponse>('/api/setup/status'),
    refetchInterval: 10_000,
    staleTime: 10_000,
    retry: 1,
    enabled: !demoMode,
  })
  const providerLabel = 'Harness'

  if (demoMode) {
    return { status: 'not_configured', connected: false, isLoading: false, providerLabel }
  }

  const service = data?.services?.harness
  const detail = detailForService(service)

  if (service?.reachable) {
    return { status: 'connected', connected: true, isLoading, providerLabel, detail }
  }

  if (service && service.configured === false) {
    return { status: 'not_configured', connected: false, isLoading, providerLabel, detail }
  }

  return { status: 'disconnected', connected: false, isLoading, providerLabel, detail }
}
