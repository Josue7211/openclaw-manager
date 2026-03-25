import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/components/ui/Toast'
import type { GatewaySessionsResponse } from '@/pages/sessions/types'

interface RenameArgs {
  key: string
  label: string
}

/**
 * Provides rename, delete, and compact mutations for gateway sessions.
 *
 * - Rename and delete use optimistic updates with rollback on error.
 * - Compact shows toast feedback on success/error.
 * - All three invalidate the gateway sessions query on settlement.
 */
export function useSessionMutations() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const renameMutation = useMutation({
    mutationFn: ({ key, label }: RenameArgs) =>
      api.patch(`/api/gateway/sessions/${key}`, { label }),
    onMutate: async ({ key, label }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
      const prev = queryClient.getQueryData<GatewaySessionsResponse>(
        queryKeys.gatewaySessions,
      )
      if (prev) {
        queryClient.setQueryData<GatewaySessionsResponse>(
          queryKeys.gatewaySessions,
          {
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.key === key ? { ...s, label } : s,
            ),
          },
        )
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.gatewaySessions, ctx.prev)
      }
      toast.show({ type: 'error', message: 'Failed to rename session' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.del(`/api/gateway/sessions/${key}`),
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
      const prev = queryClient.getQueryData<GatewaySessionsResponse>(
        queryKeys.gatewaySessions,
      )
      if (prev) {
        queryClient.setQueryData<GatewaySessionsResponse>(
          queryKeys.gatewaySessions,
          {
            ...prev,
            sessions: prev.sessions.filter((s) => s.key !== key),
          },
        )
      }
      return { prev }
    },
    onError: (_err, _key, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKeys.gatewaySessions, ctx.prev)
      }
      toast.show({ type: 'error', message: 'Failed to delete session' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  const compactMutation = useMutation({
    mutationFn: (key: string) =>
      api.post<{ ok: boolean; data?: { tokensSaved?: number } }>(
        `/api/gateway/sessions/${key}/compact`,
      ),
    onSuccess: (data) => {
      const saved = (data as { data?: { tokensSaved?: number } })?.data
        ?.tokensSaved
      toast.show({
        type: 'success',
        message: saved
          ? `Compacted — saved ${saved} tokens`
          : 'Session compacted',
      })
    },
    onError: () => {
      toast.show({ type: 'error', message: 'Failed to compact session' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  return { renameMutation, deleteMutation, compactMutation }
}
