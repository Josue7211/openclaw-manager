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

const mockUseGatewaySSE = vi.fn()
vi.mock('@/lib/hooks/useGatewaySSE', () => ({
  useGatewaySSE: (...args: unknown[]) => mockUseGatewaySSE(...args),
}))

import { useGatewaySessions } from '../useGatewaySessions'
import { queryKeys } from '@/lib/query-keys'

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

describe('useGatewaySessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls useGatewaySSE with events: ["chat"] and correct queryKeys', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ sessions: [] })

    renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    expect(mockUseGatewaySSE).toHaveBeenCalledWith(
      expect.objectContaining({
        events: ['chat'],
        queryKeys: expect.objectContaining({
          chat: queryKeys.gatewaySessions,
        }),
      }),
    )
  })

  it('calls useGatewaySSE with undefined options in demo mode', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(true)

    renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    // In demo mode, useGatewaySSE should be called but with no options (undefined)
    // so it does nothing -- the hook must still be called (React rules of hooks)
    expect(mockUseGatewaySSE).toHaveBeenCalled()
    const callArgs = mockUseGatewaySSE.mock.calls[0]
    expect(callArgs[0]).toBeUndefined()
  })

  it('returns demo data when in demo mode without calling API', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(true)

    const { api } = await import('@/lib/api')

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    expect(result.current.sessions).toEqual([])
    expect(result.current.available).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.source).toBe('none')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('returns gateway sessions when available', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const mockSessions = [
      { id: '1', task: 'test', status: 'running', model: null, workingDir: null, startedAt: null, duration: null, kind: 'chat' },
    ]

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ sessions: mockSessions })

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.sessions).toEqual(mockSessions)
    expect(result.current.source).toBe('gateway')
    expect(result.current.available).toBe(true)
  })
})
