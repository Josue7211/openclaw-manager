import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/components/ui/Toast'
import type { GatewaySessionsResponse } from '@/features/sessions/types'

interface RenameArgs {
  key: string
  label: string
  environmentId?: string | null
}

interface PinArgs {
  key: string
  pinned: boolean
  environmentId?: string | null
}

type GatewaySessionsSnapshot = Array<[readonly unknown[], GatewaySessionsResponse | undefined]>
type SessionMutationTarget = string | { key: string; environmentId?: string | null }

const chatSessionHistoryKey = (key: string) => [...queryKeys.chatHistory, key] as const

function normalizeEnvironmentId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || ''
}

function sessionMatchesMutationTarget(
  session: { key: string; environmentId?: string | null },
  target: { key: string; environmentId?: string | null },
): boolean {
  if (session.key !== target.key) return false
  const environmentId = normalizeEnvironmentId(target.environmentId)
  if (!environmentId) return true
  return normalizeEnvironmentId(session.environmentId) === environmentId
}

function resolveSessionMutationTarget(target: SessionMutationTarget): { key: string; environmentId?: string | null } {
  return typeof target === 'string' ? { key: target } : target
}

function sessionMutationUrl(key: string, suffix = '', environmentId?: string | null): string {
  const base = `/api/gateway/sessions/${encodeURIComponent(key)}${suffix}`
  const environment = environmentId?.trim()
  return environment ? `${base}?environmentId=${encodeURIComponent(environment)}` : base
}

function updateGatewaySessionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (data: GatewaySessionsResponse) => GatewaySessionsResponse,
) {
  queryClient.setQueriesData<GatewaySessionsResponse>(
    { queryKey: queryKeys.gatewaySessions },
    (current) => current ? updater(current) : current,
  )
}

function restoreGatewaySessionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: GatewaySessionsSnapshot,
) {
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data)
  }
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
    mutationFn: ({ key, label, environmentId }: RenameArgs) =>
      api.patch(sessionMutationUrl(key, '', environmentId), { label }),
    onMutate: async ({ key, label, environmentId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
      const snapshots = queryClient.getQueriesData<GatewaySessionsResponse>({
        queryKey: queryKeys.gatewaySessions,
      })
      updateGatewaySessionQueries(queryClient, (current) => ({
        ...current,
        sessions: current.sessions.map((s) =>
          sessionMatchesMutationTarget(s, { key, environmentId }) ? { ...s, label } : s,
        ),
      }))
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshots) {
        restoreGatewaySessionQueries(queryClient, ctx.snapshots)
      }
      toast.show({ type: 'error', message: 'Failed to rename session' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (target: SessionMutationTarget) => {
      const { key, environmentId } = resolveSessionMutationTarget(target)
      return api.del(sessionMutationUrl(key, '', environmentId))
    },
    onMutate: async (target) => {
      const { key, environmentId } = resolveSessionMutationTarget(target)
      await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
      const snapshots = queryClient.getQueriesData<GatewaySessionsResponse>({
        queryKey: queryKeys.gatewaySessions,
      })
      updateGatewaySessionQueries(queryClient, (current) => ({
        ...current,
        sessions: current.sessions.filter((s) => !sessionMatchesMutationTarget(s, { key, environmentId })),
      }))
      return { snapshots }
    },
    onError: (_err, _key, ctx) => {
      if (ctx?.snapshots) {
        restoreGatewaySessionQueries(queryClient, ctx.snapshots)
      }
      toast.show({ type: 'error', message: 'Failed to delete session' })
    },
    onSuccess: (_data, target) => {
      const { key } = resolveSessionMutationTarget(target)
      queryClient.removeQueries({ queryKey: chatSessionHistoryKey(key) })
      queryClient.removeQueries({ queryKey: queryKeys.sessionHistory(key) })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  const pinMutation = useMutation({
    mutationFn: ({ key, pinned, environmentId }: PinArgs) =>
      api.patch(sessionMutationUrl(key, '', environmentId), { pinned, favorite: pinned }),
    onMutate: async ({ key, pinned, environmentId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.gatewaySessions })
      const snapshots = queryClient.getQueriesData<GatewaySessionsResponse>({
        queryKey: queryKeys.gatewaySessions,
      })
      updateGatewaySessionQueries(queryClient, (current) => ({
        ...current,
        sessions: current.sessions.map((s) =>
          sessionMatchesMutationTarget(s, { key, environmentId }) ? { ...s, pinned, favorite: pinned } : s,
        ),
      }))
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshots) {
        restoreGatewaySessionQueries(queryClient, ctx.snapshots)
      }
      toast.show({ type: 'error', message: 'Failed to update pinned session' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
    },
  })

  const compactMutation = useMutation({
    mutationFn: (target: SessionMutationTarget) => {
      const { key, environmentId } = resolveSessionMutationTarget(target)
      return api.post<{ ok: boolean; data?: { tokensSaved?: number } }>(
        sessionMutationUrl(key, '/compact', environmentId),
      )
    },
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
    onSettled: (_data, error, target) => {
      const { key } = resolveSessionMutationTarget(target)
      queryClient.invalidateQueries({ queryKey: queryKeys.gatewaySessions })
      if (!error) {
        queryClient.invalidateQueries({ queryKey: chatSessionHistoryKey(key) })
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionHistory(key) })
      }
    },
  })

  return { renameMutation, deleteMutation, pinMutation, compactMutation }
}
