import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { CronJob, CronSchedule } from '@/pages/crons/types'

interface CronsResponse {
  jobs: CronJob[]
}

/**
 * Cron CRUD mutations with optimistic updates.
 * Follows the useAgents pattern: cancel queries, snapshot, optimistic set, rollback on error, invalidate on settle.
 */
export function useCrons() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<CronsResponse>({
    queryKey: queryKeys.crons,
    queryFn: () => api.get<CronsResponse>('/api/crons'),
    enabled: !isDemoMode(),
  })

  const invalidateCrons = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.crons })
  }, [queryClient])

  const createMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      schedule: CronSchedule
      description?: string
    }) => {
      return api.post<{ job: CronJob }>('/api/crons', payload)
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.crons })
      const prev = queryClient.getQueryData<CronsResponse>(queryKeys.crons)
      queryClient.setQueryData<CronsResponse>(queryKeys.crons, (old) => ({
        ...old,
        jobs: [
          ...(old?.jobs || []),
          {
            id: 'temp-' + Date.now(),
            name: payload.name,
            schedule: payload.schedule,
            description: payload.description,
            enabled: true,
          },
        ],
      }))
      return { prev }
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.crons, ctx.prev)
    },
    onSettled: () => invalidateCrons(),
  })

  const updateMutation = useMutation({
    mutationFn: async (fields: { id: string } & Partial<CronJob>) => {
      return api.patch<{ job: CronJob }>('/api/crons/update', fields)
    },
    onMutate: async (fields) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.crons })
      const prev = queryClient.getQueryData<CronsResponse>(queryKeys.crons)
      queryClient.setQueryData<CronsResponse>(queryKeys.crons, (old) => ({
        ...old,
        jobs: (old?.jobs || []).map((j) =>
          j.id === fields.id ? { ...j, ...fields } : j
        ),
      }))
      return { prev }
    },
    onError: (_err, _fields, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.crons, ctx.prev)
    },
    onSettled: () => invalidateCrons(),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del('/api/crons/delete', { id })
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.crons })
      const prev = queryClient.getQueryData<CronsResponse>(queryKeys.crons)
      queryClient.setQueryData<CronsResponse>(queryKeys.crons, (old) => ({
        ...old,
        jobs: (old?.jobs || []).filter((j) => j.id !== id),
      }))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.crons, ctx.prev)
    },
    onSettled: () => invalidateCrons(),
  })

  return {
    jobs: data?.jobs ?? [],
    loading: isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    invalidateCrons,
  }
}
