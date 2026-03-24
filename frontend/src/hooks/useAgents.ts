import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { useGatewaySSE } from '@/lib/hooks/useGatewaySSE'
import type { Agent, CreateAgentPayload, AgentActionPayload } from '@/pages/agents/types'

interface AgentsResponse {
  agents: Agent[]
}

/**
 * Shared agent CRUD mutations with optimistic updates.
 * Follows the useTodos pattern: cancel queries, snapshot, optimistic set, rollback on error, invalidate on settle.
 */
export function useAgents() {
  const queryClient = useQueryClient()

  const _demo = isDemoMode()

  const { data, isLoading } = useQuery<AgentsResponse>({
    queryKey: queryKeys.agents,
    queryFn: () => api.get<AgentsResponse>('/api/agents'),
    enabled: !_demo,
  })

  // Subscribe to gateway agent events for real-time cache invalidation.
  // When the gateway broadcasts an agent event (started, stopped, config changed),
  // React Query automatically refetches the agents list.
  // In demo mode, pass empty events to make useGatewaySSE a no-op while
  // keeping hook call order consistent.
  useGatewaySSE(_demo ? {} : {
    events: ['agent'],
    queryKeys: {
      agent: queryKeys.agents,
    },
  })

  const invalidateAgents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.agents })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: async (payload: CreateAgentPayload) => {
      return api.post<{ agent: Agent }>('/api/agents', payload)
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agents })
      const prev = queryClient.getQueryData<AgentsResponse>(queryKeys.agents)
      queryClient.setQueryData<AgentsResponse>(queryKeys.agents, (old) => ({
        ...old,
        agents: [
          ...(old?.agents || []),
          {
            id: 'temp-' + Date.now(),
            name: payload.display_name.toLowerCase().replace(/\s+/g, '_'),
            display_name: payload.display_name,
            emoji: payload.emoji ?? '',
            role: payload.role ?? '',
            status: 'idle',
            current_task: null,
            color: null,
            model: payload.model ?? null,
            sort_order: 999,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }))
      return { prev }
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.agents, ctx.prev)
    },
    onSettled: () => invalidateAgents(),
  })

  const updateMutation = useMutation({
    mutationFn: async (fields: { id: string } & Partial<Agent>) => {
      return api.patch<{ agent: Agent }>('/api/agents', fields)
    },
    onMutate: async (fields) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agents })
      const prev = queryClient.getQueryData<AgentsResponse>(queryKeys.agents)
      queryClient.setQueryData<AgentsResponse>(queryKeys.agents, (old) => ({
        ...old,
        agents: (old?.agents || []).map((a) =>
          a.id === fields.id ? { ...a, ...fields, updated_at: new Date().toISOString() } : a
        ),
      }))
      return { prev }
    },
    onError: (_err, _fields, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.agents, ctx.prev)
    },
    onSettled: () => invalidateAgents(),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del('/api/agents', { id })
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agents })
      const prev = queryClient.getQueryData<AgentsResponse>(queryKeys.agents)
      queryClient.setQueryData<AgentsResponse>(queryKeys.agents, (old) => ({
        ...old,
        agents: (old?.agents || []).filter((a) => a.id !== id),
      }))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.agents, ctx.prev)
    },
    onSettled: () => invalidateAgents(),
  })

  const actionMutation = useMutation({
    mutationFn: async (payload: AgentActionPayload) => {
      return api.post('/api/agents/action', payload)
    },
    onSettled: () => invalidateAgents(),
  })

  return {
    agents: data?.agents ?? [],
    loading: isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    actionMutation,
    invalidateAgents,
  }
}
