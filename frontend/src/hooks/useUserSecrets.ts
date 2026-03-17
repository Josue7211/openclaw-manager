import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

interface SecretEntry {
  service: string
  updated_at?: string
}

/** List all stored secret service names */
export function useSecretsList() {
  return useQuery<SecretEntry[]>({
    queryKey: queryKeys.secrets.list(),
    queryFn: () => api.get<SecretEntry[]>('/api/secrets'),
  })
}

/** Get decrypted credentials for a specific service */
export function useSecret(service: string) {
  return useQuery<Record<string, string>>({
    queryKey: queryKeys.secrets.detail(service),
    queryFn: () => api.get<Record<string, string>>(`/api/secrets/${service}`),
    enabled: !!service,
  })
}

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

/** Delete a service's credentials */
export function useDeleteSecret() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (service: string) => api.del(`/api/secrets/${service}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.secrets.list() })
    },
  })
}
