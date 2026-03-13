import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useTauriQuery<T>(
  key: string[],
  path: string,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api.get<T>(path),
    ...options,
  })
}
