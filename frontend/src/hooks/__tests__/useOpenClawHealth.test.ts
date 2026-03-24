import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import React from 'react'

// Mock the api module
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({})),
  },
}))

/**
 * Mirrors the inline useQuery pattern from OpenClaw.tsx (line 361-365) and
 * Agents.tsx (line 23-28) that queries /api/openclaw/health.
 */
function useOpenClawHealth() {
  return useQuery({
    queryKey: ['openclaw', 'health'],
    queryFn: () =>
      import('@/lib/api').then(({ api }) =>
        api.get<{ ok: boolean; status: string; gateway?: boolean }>('/api/openclaw/health'),
      ),
    staleTime: 30_000,
  })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('OpenClaw health query (/api/openclaw/health)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok=true with gateway=true when connected via WebSocket', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      ok: true,
      status: 'connected',
      gateway: true,
    })

    const { result } = renderHook(() => useOpenClawHealth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.ok).toBe(true)
    expect(result.current.data?.status).toBe('connected')
    expect(result.current.data?.gateway).toBe(true)
  })

  it('returns ok=true with gateway=false when connected via workspace API', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      ok: true,
      status: 'connected',
      gateway: false,
    })

    const { result } = renderHook(() => useOpenClawHealth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.ok).toBe(true)
    expect(result.current.data?.status).toBe('connected')
    expect(result.current.data?.gateway).toBe(false)
  })

  it('returns ok=false with status=unreachable when gateway is unreachable', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      ok: false,
      status: 'unreachable',
    })

    const { result } = renderHook(() => useOpenClawHealth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.ok).toBe(false)
    expect(result.current.data?.status).toBe('unreachable')
  })

  it('returns ok=false with status=not_configured when gateway is not configured', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      ok: false,
      status: 'not_configured',
    })

    const { result } = renderHook(() => useOpenClawHealth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.ok).toBe(false)
    expect(result.current.data?.status).toBe('not_configured')
  })
})
