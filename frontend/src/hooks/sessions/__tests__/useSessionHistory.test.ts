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

import { useSessionHistory } from '../useSessionHistory'

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

describe('useSessionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty messages when sessionId is null', async () => {
    const { api } = await import('@/lib/api')

    const { result } = renderHook(() => useSessionHistory(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('calls api.get with correct endpoint including sessionId', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ messages: [], hasMore: false })

    const { result } = renderHook(() => useSessionHistory('sess-abc'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/gateway/sessions/sess-abc/history'),
    )
  })

  it('returns messages from successful response', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({
      messages: [
        { id: '1', role: 'user', content: 'Hello', timestamp: '2026-03-24T10:00:00Z' },
        { id: '2', role: 'assistant', content: 'Hi there', timestamp: '2026-03-24T10:00:01Z' },
      ],
    })

    const { result } = renderHook(() => useSessionHistory('sess-abc'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0].role).toBe('user')
    expect(result.current.messages[1].role).toBe('assistant')
  })

  it('returns hasMore from response when present', async () => {
    const { api } = await import('@/lib/api')
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: '2026-03-24T10:00:00Z',
    }))
    vi.mocked(api.get).mockResolvedValue({ messages, hasMore: true })

    const { result } = renderHook(() => useSessionHistory('sess-abc'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasMore).toBe(true)
  })

  it('returns error string on fetch failure', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSessionHistory('sess-abc'), {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(result.current.error).toBeTruthy()
      },
      { timeout: 5000 },
    )

    expect(result.current.error).toContain('Network error')
  })

  it('does not call api.get in demo mode', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(true)

    const { api } = await import('@/lib/api')

    const { result } = renderHook(() => useSessionHistory('sess-abc'), {
      wrapper: createWrapper(),
    })

    expect(result.current.messages).toEqual([])
    expect(api.get).not.toHaveBeenCalled()
  })
})
