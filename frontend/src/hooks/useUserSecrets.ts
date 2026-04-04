import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

/** Save (upsert) credentials for a service */
export function useSaveSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ service, credentials }: { service: string; credentials: Record<string, string> }) =>
      api.put(`/api/secrets/${service}`, { credentials }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.secrets.list() })
      qc.invalidateQueries({ queryKey: queryKeys.secrets.detail(variables.service) })
    },
  })
}

