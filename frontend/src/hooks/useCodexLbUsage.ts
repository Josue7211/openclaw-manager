import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { normalizeCodexLbUsage, type CodexLbUsageSummary } from '@/lib/codex-lb-usage'
import { queryKeys } from '@/lib/query-keys'
import type { UsageData } from '@/features/harness/types'

const CODEX_LB_USAGE_CACHE_KEY = 'codex-lb-usage:last-good'

interface CachedUsage {
  raw: UsageData
  cachedAt: number
}

function readCachedUsage(): CachedUsage | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CODEX_LB_USAGE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedUsage>
    if (!parsed || typeof parsed !== 'object' || !parsed.raw || typeof parsed.cachedAt !== 'number') return null
    return { raw: parsed.raw, cachedAt: parsed.cachedAt }
  } catch {
    return null
  }
}

function writeCachedUsage(raw: UsageData) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CODEX_LB_USAGE_CACHE_KEY, JSON.stringify({ raw, cachedAt: Date.now() }))
  } catch {
    // ignore storage failures
  }
}

export function useCodexLbUsage(): {
  rawUsage: UsageData | undefined
  usage: CodexLbUsageSummary | null
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
    queryFn: () => api.get<UsageData>('/api/harness/usage'),
    refetchInterval: 30_000,
    staleTime: 30_000,
    initialData: cached?.raw,
    initialDataUpdatedAt: cached?.cachedAt,
  })

  useEffect(() => {
    if (query.data && query.data !== cached?.raw && !query.error) {
      writeCachedUsage(query.data)
    }
  }, [cached?.raw, query.data, query.error])

  const usage = useMemo(() => normalizeCodexLbUsage(query.data), [query.data])
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

export { CODEX_LB_USAGE_CACHE_KEY }
