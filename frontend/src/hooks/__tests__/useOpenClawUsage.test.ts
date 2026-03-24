import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { UsageData } from '@/pages/openclaw/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/lib/api'
import { useOpenClawUsage } from '../useOpenClawUsage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOpenClawUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns usage data on successful fetch', async () => {
    const mockData: UsageData = {
      total_tokens: 150000,
      prompt_tokens: 80000,
      completion_tokens: 70000,
      total_cost: 2.5,
      period: '2026-03',
      daily: [{ date: '2026-03-24', tokens: 50000, cost: 0.85 }],
      models: [{ model: 'claude-sonnet-4-6', tokens: 100000, cost: 1.5, requests: 50 }],
    }
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockData)

    const { result } = renderHook(() => useOpenClawUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.usage).toEqual(mockData)
    expect(result.current.error).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/api/openclaw/usage')
  })

  it('returns empty usage when api returns minimal data', async () => {
    const mockData: UsageData = { total_tokens: 0 }
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockData)

    const { result } = renderHook(() => useOpenClawUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.usage).toEqual({ total_tokens: 0 })
    expect(result.current.usage?.daily).toBeUndefined()
    expect(result.current.usage?.models).toBeUndefined()
  })

  it('starts in loading state', () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useOpenClawUsage(), {
      wrapper: createWrapper(),
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.usage).toBeUndefined()
  })

  it('returns error on fetch failure', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useOpenClawUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.usage).toBeUndefined()
  })

  it('handles daily array with multiple days', async () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-03-${18 + i}`,
      tokens: (i + 1) * 10000,
      cost: (i + 1) * 0.15,
    }))
    const mockData: UsageData = {
      total_tokens: 280000,
      total_cost: 7.35,
      daily,
    }
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockData)

    const { result } = renderHook(() => useOpenClawUsage(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.usage?.daily).toHaveLength(7)
    expect(result.current.usage?.daily?.[0].date).toBe('2026-03-18')
    expect(result.current.usage?.daily?.[6].tokens).toBe(70000)
  })
})
