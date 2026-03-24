import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import { setUnreadCount } from '@/lib/unread-store'
import type { ApprovalsResponse } from '@/pages/approvals/types'

export function useApprovals() {
  const demo = isDemoMode()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.approvals,
    queryFn: () => api.get<ApprovalsResponse>('/api/approvals'),
    refetchInterval: demo ? false : 3_000,
    staleTime: 3_000,
    enabled: !demo,
    retry: 1,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/approvals/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.approvals }),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`/api/approvals/${id}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.approvals }),
  })

  const approvals = data?.approvals ?? []
  const pendingCount = approvals.filter(a => a.status === 'pending').length

  // Sync pending count to sidebar unread badge
  useEffect(() => {
    setUnreadCount('/approvals', pendingCount)
  }, [pendingCount])

  return {
    approvals,
    pendingCount,
    isLoading,
    approve: approveMutation.mutate,
    reject: rejectMutation.mutate,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
  }
}
