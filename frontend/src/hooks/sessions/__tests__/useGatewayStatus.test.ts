import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock modules before importing the hook
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({})),
  },
}))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => false),
}))

import { useGatewayStatus } from '../useGatewayStatus'

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

describe('useGatewayStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns not_configured in demo mode without calling the API', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(true)

    const { result } = renderHook(() => useGatewayStatus(), {
      wrapper: createWrapper(),
    })

    expect(result.current.status).toBe('not_configured')
    expect(result.current.connected).toBe(false)
    expect(result.current.isLoading).toBe(false)

    const { api } = await import('@/lib/api')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('returns connected=true when API reports connected', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      connected: true,
      status: 'connected',
    })

    const { result } = renderHook(() => useGatewayStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.status).toBe('connected')
    expect(result.current.connected).toBe(true)
  })

  it('returns connected=false when API reports disconnected', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      connected: false,
      status: 'disconnected',
    })

    const { result } = renderHook(() => useGatewayStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.status).toBe('disconnected')
    expect(result.current.connected).toBe(false)
  })

  it('returns status=not_configured when API reports not_configured', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      connected: false,
      status: 'not_configured',
    })

    const { result } = renderHook(() => useGatewayStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.status).toBe('not_configured')
    expect(result.current.connected).toBe(false)
  })

  it('defaults to not_configured when API throws (network error)', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useGatewayStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
      },
      { timeout: 5000 },
    )

    expect(result.current.status).toBe('not_configured')
    expect(result.current.connected).toBe(false)
  })
})
