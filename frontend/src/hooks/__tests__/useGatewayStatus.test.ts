import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => false),
}))

import { useGatewayStatus } from '../sessions/useGatewayStatus'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children)
    },
  }
}

describe('useGatewayStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns connected state when gateway is reachable', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ connected: true, status: 'connected' })

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useGatewayStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.status).toBe('connected')
    expect(result.current.connected).toBe(true)
  })

  it('returns disconnected state when gateway is unreachable', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ connected: false, status: 'disconnected' })

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useGatewayStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.status).toBe('disconnected')
    expect(result.current.connected).toBe(false)
  })

  it('returns not_configured when gateway has no config', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ connected: false, status: 'not_configured' })

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useGatewayStatus(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.status).toBe('not_configured')
    expect(result.current.connected).toBe(false)
  })

  it('defaults to not_configured on fetch error', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useGatewayStatus(), { wrapper })

    // Hook has retry: 1, so it attempts twice before settling
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5000 },
    )

    expect(result.current.status).toBe('not_configured')
    expect(result.current.connected).toBe(false)
  })

  it('returns not_configured immediately in demo mode without calling api', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(true)
    const { api } = await import('@/lib/api')

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useGatewayStatus(), { wrapper })

    // Should return immediately without loading
    expect(result.current.status).toBe('not_configured')
    expect(result.current.connected).toBe(false)
    expect(result.current.isLoading).toBe(false)

    // Wait a tick to ensure no async calls
    await new Promise((r) => setTimeout(r, 50))
    expect(api.get).not.toHaveBeenCalled()

    vi.mocked(isDemoMode).mockReturnValue(false)
  })

  it('calls the correct API endpoint', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ connected: true, status: 'connected' })

    const { wrapper } = createWrapper()
    renderHook(() => useGatewayStatus(), { wrapper })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/gateway/status')
    })
  })
})
