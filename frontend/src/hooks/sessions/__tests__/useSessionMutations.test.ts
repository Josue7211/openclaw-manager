import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockToastShow = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    patch: vi.fn(() => Promise.resolve({ ok: true })),
    del: vi.fn(() => Promise.resolve({ ok: true })),
    post: vi.fn(() => Promise.resolve({ ok: true })),
  },
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockToastShow }),
}))

import { useSessionMutations } from '../useSessionMutations'
import { queryKeys } from '@/lib/query-keys'

const SEED_SESSIONS = {
  ok: true,
  sessions: [
    {
      key: 'sess-1',
      label: 'Test Session',
      agentKey: 'bjorn',
      messageCount: 5,
      lastActivity: '2026-01-01T00:00:00Z',
    },
    {
      key: 'sess-2',
      label: 'Another',
      agentKey: 'bjorn',
      messageCount: 3,
      lastActivity: '2026-01-02T00:00:00Z',
    },
  ],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(queryKeys.gatewaySessions, structuredClone(SEED_SESSIONS))
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

describe('useSessionMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('renameMutation', () => {
    it('calls api.patch with correct URL and body', async () => {
      const { api } = await import('@/lib/api')
      const { Wrapper } = createWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.renameMutation.mutate({ key: 'sess-1', label: 'New Label' })
      })

      await waitFor(() => expect(result.current.renameMutation.isIdle).toBe(true))

      expect(api.patch).toHaveBeenCalledWith('/api/gateway/sessions/sess-1', {
        label: 'New Label',
      })
    })

    it('optimistically updates the session label in cache', async () => {
      const { Wrapper, queryClient } = createWrapper()
      // Make the API call hang so we can observe the optimistic state
      const { api } = await import('@/lib/api')
      let resolveCall: (v: unknown) => void
      vi.mocked(api.patch).mockImplementation(
        () => new Promise((r) => { resolveCall = r }),
      )

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      act(() => {
        result.current.renameMutation.mutate({ key: 'sess-1', label: 'Updated' })
      })

      await waitFor(() => {
        const data = queryClient.getQueryData<typeof SEED_SESSIONS>(
          queryKeys.gatewaySessions,
        )
        expect(data?.sessions.find((s) => s.key === 'sess-1')?.label).toBe('Updated')
      })

      // Clean up by resolving
      resolveCall!({ ok: true })
    })

    it('rolls back cache on error', async () => {
      const { Wrapper, queryClient } = createWrapper()
      const { api } = await import('@/lib/api')
      vi.mocked(api.patch).mockRejectedValue(new Error('fail'))

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.renameMutation.mutate({ key: 'sess-1', label: 'Bad' })
      })

      await waitFor(() => expect(result.current.renameMutation.isIdle).toBe(true))

      const data = queryClient.getQueryData<typeof SEED_SESSIONS>(
        queryKeys.gatewaySessions,
      )
      expect(data?.sessions.find((s) => s.key === 'sess-1')?.label).toBe('Test Session')
    })
  })

  describe('deleteMutation', () => {
    it('calls api.del with correct URL', async () => {
      const { api } = await import('@/lib/api')
      const { Wrapper } = createWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.deleteMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.deleteMutation.isIdle).toBe(true))

      expect(api.del).toHaveBeenCalledWith('/api/gateway/sessions/sess-1')
    })

    it('optimistically removes the session from cache', async () => {
      const { Wrapper, queryClient } = createWrapper()
      const { api } = await import('@/lib/api')
      let resolveCall: (v: unknown) => void
      vi.mocked(api.del).mockImplementation(
        () => new Promise((r) => { resolveCall = r }),
      )

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      act(() => {
        result.current.deleteMutation.mutate('sess-1')
      })

      await waitFor(() => {
        const data = queryClient.getQueryData<typeof SEED_SESSIONS>(
          queryKeys.gatewaySessions,
        )
        expect(data?.sessions.find((s) => s.key === 'sess-1')).toBeUndefined()
        expect(data?.sessions).toHaveLength(1)
      })

      resolveCall!({ ok: true })
    })

    it('rolls back cache on error', async () => {
      const { Wrapper, queryClient } = createWrapper()
      const { api } = await import('@/lib/api')
      vi.mocked(api.del).mockRejectedValue(new Error('fail'))

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.deleteMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.deleteMutation.isIdle).toBe(true))

      const data = queryClient.getQueryData<typeof SEED_SESSIONS>(
        queryKeys.gatewaySessions,
      )
      expect(data?.sessions).toHaveLength(2)
      expect(data?.sessions.find((s) => s.key === 'sess-1')).toBeDefined()
    })
  })

  describe('compactMutation', () => {
    it('calls api.post with correct URL', async () => {
      const { api } = await import('@/lib/api')
      const { Wrapper } = createWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.compactMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.compactMutation.isIdle).toBe(true))

      expect(api.post).toHaveBeenCalledWith('/api/gateway/sessions/sess-1/compact')
    })

    it('shows success toast on completion', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.post).mockResolvedValue({ ok: true })
      const { Wrapper } = createWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.compactMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.compactMutation.isIdle).toBe(true))

      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      )
    })

    it('shows error toast on failure', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.post).mockRejectedValue(new Error('fail'))
      const { Wrapper } = createWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.compactMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.compactMutation.isIdle).toBe(true))

      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: 'Failed to compact session',
        }),
      )
    })
  })

  describe('invalidation', () => {
    it('all mutations invalidate gatewaySessions on settlement', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.patch).mockResolvedValue({ ok: true })
      vi.mocked(api.del).mockResolvedValue({ ok: true })
      vi.mocked(api.post).mockResolvedValue({ ok: true })

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      // Rename
      await act(async () => {
        result.current.renameMutation.mutate({ key: 'sess-1', label: 'x' })
      })
      await waitFor(() => expect(result.current.renameMutation.isIdle).toBe(true))

      // Delete
      await act(async () => {
        result.current.deleteMutation.mutate('sess-2')
      })
      await waitFor(() => expect(result.current.deleteMutation.isIdle).toBe(true))

      // Compact
      await act(async () => {
        result.current.compactMutation.mutate('sess-1')
      })
      await waitFor(() => expect(result.current.compactMutation.isIdle).toBe(true))

      const invalidateCalls = invalidateSpy.mock.calls.filter((call) => {
        const opts = call[0] as { queryKey?: readonly string[] }
        return (
          opts?.queryKey &&
          opts.queryKey[0] === 'gateway' &&
          opts.queryKey[1] === 'sessions'
        )
      })

      // At least 3 calls (one per mutation's onSettled)
      expect(invalidateCalls.length).toBeGreaterThanOrEqual(3)
    })
  })
})
