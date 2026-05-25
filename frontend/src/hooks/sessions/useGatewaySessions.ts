import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import { CHAT_SESSIONS_CHANGED_EVENT } from '@/lib/chat-session-selection'
import type { HermesSession, GatewaySessionsResponse } from '@/chat/t3-adapters/gatewaySessionTypes'

interface UseGatewaySessionsReturn {
  sessions: HermesSession[]
  available: boolean
  isLoading: boolean
}

export interface GatewaySessionFilters {
  cwd?: string[]
  projectId?: string
  projectIds?: string[]
  project?: string
  branch?: string
  runtime?: string
  environmentId?: string
  includeUnscoped?: boolean
}

function compactString(value?: string): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function canonicalCwdFilter(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/g, '')
}

function uniqueCanonicalCwdFilters(values: string[] = []): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const canonical = canonicalCwdFilter(value)
    if (!canonical) continue
    const key = canonical.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(canonical)
  }
  return result.sort((left, right) => left.localeCompare(right))
}

function sessionLastActivityMs(session: HermesSession): number {
  const timestamp = new Date(session.lastActivity).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function gatewaySessionsPath(filters?: GatewaySessionFilters): string {
  const params = new URLSearchParams()
  const cwd = uniqueCanonicalCwdFilters(filters?.cwd)
  cwd.forEach((item) => params.append('cwd', item))
  const projectIds = Array.from(new Set([
    ...(filters?.projectId ? [filters.projectId] : []),
    ...(filters?.projectIds ?? []),
  ].map((item) => item.trim()).filter(Boolean))).sort()
  projectIds.forEach((item) => params.append('projectId', item))

  const project = compactString(filters?.project)
  const branch = compactString(filters?.branch)
  const runtime = compactString(filters?.runtime)
  const environmentId = compactString(filters?.environmentId)
  if (project) params.set('project', project)
  if (branch) params.set('branch', branch)
  if (runtime) params.set('runtime', runtime)
  if (environmentId) params.set('environmentId', environmentId)
  if (filters?.includeUnscoped) params.set('includeUnscoped', '1')

  const query = params.toString()
  return query ? `/api/gateway/sessions?${query}` : '/api/gateway/sessions'
}

/**
 * Fetches all sessions from the Hermes Agent gateway via GET /api/gateway/sessions.
 * Sessions are sorted by lastActivity descending (newest first).
 * Real-time updates arrive via SSE 'chat' events which invalidate the query.
 *
 * Returns empty array and available:false in demo mode without calling API.
 */
export function useGatewaySessions(filters?: GatewaySessionFilters): UseGatewaySessionsReturn {
  const demo = isDemoMode()
  const queryClient = useQueryClient()
  const path = gatewaySessionsPath(filters)
  const queryKey = path === '/api/gateway/sessions'
    ? queryKeys.gatewaySessions
    : [...queryKeys.gatewaySessions, path] as const

  // Real-time session updates via gateway SSE — must be called unconditionally (React rules)
  // Pass undefined in demo mode to disable without violating hook ordering rules
  useGatewaySSE(demo ? undefined : {
    events: ['chat'],
    queryKeys: {
      chat: queryKeys.gatewaySessions,
    },
  })

  useEffect(() => {
    if (demo) return
    const onSessionsChanged = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    }
    window.addEventListener(CHAT_SESSIONS_CHANGED_EVENT, onSessionsChanged)
    return () => {
      window.removeEventListener(CHAT_SESSIONS_CHANGED_EVENT, onSessionsChanged)
    }
  }, [demo, queryClient])

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api.get<GatewaySessionsResponse>(path),
    refetchInterval: demo ? false : 5_000,
    staleTime: 5_000,
    enabled: !demo,
    retry: 0,
  })

  if (demo) {
    return { sessions: [], isLoading: false, available: false }
  }

  const sessions = (data?.sessions ?? []).slice().sort(
    (a, b) => sessionLastActivityMs(b) - sessionLastActivityMs(a),
  )

  return {
    sessions,
    isLoading,
    available: !isError,
  }
}
