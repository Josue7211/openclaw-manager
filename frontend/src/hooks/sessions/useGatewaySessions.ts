import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import { CHAT_SESSIONS_CHANGED_EVENT } from '@/lib/chat-session-selection'
import type { ClaudeSession, GatewaySessionsResponse } from '@/chat/t3-adapters/gatewaySessionTypes'

interface UseGatewaySessionsReturn {
  sessions: ClaudeSession[]
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

export function gatewaySessionsPath(filters?: GatewaySessionFilters): string {
  const params = new URLSearchParams()
  const cwd = Array.from(new Set((filters?.cwd ?? []).map((item) => item.trim()).filter(Boolean))).sort()
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
 * Fetches all sessions from the harness gateway via GET /api/gateway/sessions.
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
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  )

  return {
    sessions,
    isLoading,
    available: !isError,
  }
}
