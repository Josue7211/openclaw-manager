import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { normalizeHermesUsage, type HermesUsageSummary } from '@/lib/hermes-usage'
import { queryKeys } from '@/lib/query-keys'
import type { UsageData } from '@/features/harness/types'

export const HERMES_USAGE_CACHE_KEY = 'hermes-usage:last-good'
const LEGACY_CODEX_LB_USAGE_CACHE_KEY = 'codex-lb-usage:last-good'

interface CachedUsage {
  raw: UsageData
  cachedAt: number
}

function parseCachedUsage(raw: string | null): CachedUsage | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CachedUsage>
    if (!parsed || typeof parsed !== 'object' || !parsed.raw || typeof parsed.cachedAt !== 'number') return null
    return { raw: parsed.raw, cachedAt: parsed.cachedAt }
  } catch {
    return null
  }
}

function readCachedUsage(): CachedUsage | null {
  if (typeof window === 'undefined') return null
  try {
    return parseCachedUsage(localStorage.getItem(HERMES_USAGE_CACHE_KEY))
      ?? parseCachedUsage(localStorage.getItem(LEGACY_CODEX_LB_USAGE_CACHE_KEY))
  } catch {
    return null
  }
}

function writeCachedUsage(raw: UsageData) {
  if (typeof window === 'undefined') return
  try {
    const value = JSON.stringify({ raw, cachedAt: Date.now() })
    localStorage.setItem(HERMES_USAGE_CACHE_KEY, value)
    localStorage.setItem(LEGACY_CODEX_LB_USAGE_CACHE_KEY, value)
  } catch {
    // ignore storage failures
  }
}

export function useHermesUsage(): {
  rawUsage: UsageData | undefined
  usage: HermesUsageSummary | null
  loading: boolean
  fetching: boolean
  error: Error | null
  lastUpdatedAt: number | null
  fromCache: boolean
  refetch: () => void
} {
  const cached = useMemo(readCachedUsage, [])
  const query = useQuery<UsageData, Error>({
    queryKey: queryKeys.harnessUsage,
    queryFn: () => api.get<UsageData>('/api/hermes/usage'),
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    initialData: cached?.raw,
    initialDataUpdatedAt: cached?.cachedAt,
  })

  useEffect(() => {
    if (query.data && query.data !== cached?.raw && !query.error) {
      writeCachedUsage(query.data)
    }
  }, [cached?.raw, query.data, query.error])

  const usage = useMemo(() => normalizeHermesUsage(query.data), [query.data])
  const fromCache = Boolean(cached && query.data === cached.raw)

  return {
    rawUsage: query.data,
    usage,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error ?? null,
    lastUpdatedAt: query.dataUpdatedAt || cached?.cachedAt || null,
    fromCache,
    refetch: () => {
      void query.refetch()
    },
  }
}

export { LEGACY_CODEX_LB_USAGE_CACHE_KEY }
