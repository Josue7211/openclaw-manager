import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageData } from '@/features/harness/types'
import { CODEX_LB_USAGE_CACHE_KEY, useCodexLbUsage } from '../useCodexLbUsage'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/lib/api'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useCodexLbUsage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('loads successful usage and writes the last-good cache', async () => {
    const usage: UsageData = { total_tokens: 42000, total_cost: 1.25, remaining: 50, limit: 100 }
    vi.mocked(api.get).mockResolvedValue(usage)

    const { result } = renderHook(() => useCodexLbUsage(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.usage?.remaining).toBe(50))
    expect(api.get).toHaveBeenCalledWith('/api/hermes/usage')
    expect(localStorage.getItem(CODEX_LB_USAGE_CACHE_KEY)).toContain('total_tokens')
  })

  it('renders cached usage immediately while refreshing', async () => {
    localStorage.setItem(CODEX_LB_USAGE_CACHE_KEY, JSON.stringify({
      raw: { total_tokens: 1000, remaining: 20, limit: 100 },
      cachedAt: Date.now() - 60_000,
    }))
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCodexLbUsage(), { wrapper: createWrapper() })

    expect(result.current.loading).toBe(false)
    expect(result.current.fetching).toBe(true)
    expect(result.current.fromCache).toBe(true)
    expect(result.current.usage?.remaining).toBe(20)
  })

  it('keeps cached usage when refresh fails', async () => {
    localStorage.setItem(CODEX_LB_USAGE_CACHE_KEY, JSON.stringify({
      raw: { total_tokens: 1000, remaining: 20, limit: 100 },
      cachedAt: Date.now() - 60_000,
    }))
    vi.mocked(api.get).mockRejectedValue(new Error('down'))

    const { result } = renderHook(() => useCodexLbUsage(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.fromCache).toBe(true)
    expect(result.current.usage?.remaining).toBe(20)
  })

  it('reports loading with no cache and a pending request', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCodexLbUsage(), { wrapper: createWrapper() })

    expect(result.current.loading).toBe(true)
    expect(result.current.usage).toBeNull()
    expect(result.current.fromCache).toBe(false)
  })
})
