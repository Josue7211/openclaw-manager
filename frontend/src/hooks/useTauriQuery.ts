import { useQuery, UseQueryOptions } from '@tanstack/react-query'

const API_BASE = 'http://127.0.0.1:3000'

export function useTauriQuery<T>(
  key: string[],
  path: string,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${path}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    ...options,
  })
}
