import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'

interface ServiceStatus {
  status: string
  latency_ms?: number
  error?: string
  peer_hostname?: string
  peer_verified?: boolean
}

interface HealthData {
  version: string
  uptime_seconds: number
  platform: string
  hostname: string
  sqlite_cache_entries: number
  sqlite_db_size_bytes: number
  services: {
    bluebubbles: ServiceStatus
    openclaw: ServiceStatus
    agentshell: ServiceStatus
    supabase: ServiceStatus
  }
}

type ConnectionsData = Record<string, ServiceStatus>

export interface SystemService {
  name: string
  key: string
  status: string
  latency_ms?: number
  error?: string
}

const DEMO_SERVICES: SystemService[] = [
  { name: 'BlueBubbles', key: 'bluebubbles', status: 'ok', latency_ms: 12 },
  { name: 'OpenClaw', key: 'openclaw', status: 'ok', latency_ms: 8 },
  { name: 'AgentShell', key: 'agentshell', status: 'ok', latency_ms: 10 },
  { name: 'Supabase', key: 'supabase', status: 'ok', latency_ms: 5 },
]

export function useSystemInfo() {
  const demo = isDemoMode()

  const { data: health, isSuccess: healthLoaded } = useQuery<HealthData>({
    queryKey: queryKeys.health,
    queryFn: () => api.get<HealthData>('/api/status/health'),
    refetchInterval: 30_000,
    enabled: !demo,
  })

  const { data: connections, isSuccess: connectionsLoaded } = useQuery<ConnectionsData>({
    queryKey: queryKeys.connections,
    queryFn: () => api.get<ConnectionsData>('/api/status/connections'),
    refetchInterval: 30_000,
    enabled: !demo,
  })

  if (demo) {
    return {
      services: DEMO_SERVICES,
      allHealthy: true,
      connectedCount: 3,
      totalCount: 3,
      mounted: true,
    }
  }

  // Prefer connections data (includes latency + peer info), fall back to health data
  const source = connections ?? health?.services
  const services: SystemService[] = []

  if (source) {
    const entries: [string, string][] = [
      ['bluebubbles', 'BlueBubbles'],
      ['openclaw', 'OpenClaw'],
      ['agentshell', 'AgentShell'],
      ['supabase', 'Supabase'],
    ]

    for (const [key, name] of entries) {
      const svc = (source as Record<string, ServiceStatus>)[key]
      if (svc) {
        services.push({
          name,
          key,
          status: svc.status,
          latency_ms: svc.latency_ms,
          error: svc.error,
        })
      }
    }
  }

  const allHealthy = services.length > 0 && services.every(s => s.status === 'ok')
  const connectedCount = services.filter(s => s.status === 'ok').length
  const totalCount = services.length
  const mounted = healthLoaded || connectionsLoaded

  return {
    services,
    allHealthy,
    connectedCount,
    totalCount,
    mounted,
  }
}
