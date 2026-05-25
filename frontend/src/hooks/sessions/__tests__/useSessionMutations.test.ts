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
import type { GatewaySessionsResponse } from '@/chat/t3-adapters/gatewaySessionTypes'

const SEED_SESSIONS = {
  ok: true,
  sessions: [
    {
      key: 'sess-1',
      label: 'Test Session',
      agentKey: 'primary-agent',
      messageCount: 5,
      lastActivity: '2026-01-01T00:00:00Z',
    },
    {
      key: 'sess-2',
      label: 'Another',
      agentKey: 'primary-agent',
      messageCount: 3,
      lastActivity: '2026-01-02T00:00:00Z',
    },
  ],
}
const FILTERED_GATEWAY_SESSIONS_KEY = [
  ...queryKeys.gatewaySessions,
  '/api/gateway/sessions?cwd=%2FVolumes%2FT7%2Fprojects%2Fclawctrl&includeUnscoped=1',
] as const
const DUPLICATE_THREAD_SESSIONS = {
  ok: true,
  sessions: [
    {
      key: 'shared-thread',
      label: 'Local shared thread',
      agentKey: 'primary-agent',
      messageCount: 2,
      lastActivity: '2026-01-01T00:00:00Z',
      environmentId: 'local',
    },
    {
      key: 'shared-thread',
      label: 'Desktop shared thread',
      agentKey: 'primary-agent',
      messageCount: 4,
      lastActivity: '2026-01-02T00:00:00Z',
      environmentId: 'desktop',
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
  queryClient.setQueryData(FILTERED_GATEWAY_SESSIONS_KEY, structuredClone(SEED_SESSIONS))
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  }
}

function createDuplicateThreadWrapper() {
  const wrapper = createWrapper()
  wrapper.queryClient.setQueryData(queryKeys.gatewaySessions, structuredClone(DUPLICATE_THREAD_SESSIONS))
  wrapper.queryClient.setQueryData(FILTERED_GATEWAY_SESSIONS_KEY, structuredClone(DUPLICATE_THREAD_SESSIONS))
  return wrapper
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
        const data = queryClient.getQueryData<GatewaySessionsResponse>(
          queryKeys.gatewaySessions,
        )
        const filteredData = queryClient.getQueryData<GatewaySessionsResponse>(
          FILTERED_GATEWAY_SESSIONS_KEY,
        )
        expect(data?.sessions.find((s) => s.key === 'sess-1')?.label).toBe('Updated')
        expect(filteredData?.sessions.find((s) => s.key === 'sess-1')?.label).toBe('Updated')
      })

      // Clean up by resolving
      resolveCall!({ ok: true })
    })

    it('scopes optimistic label updates by environment when thread ids collide', async () => {
      const { Wrapper, queryClient } = createDuplicateThreadWrapper()
      const { api } = await import('@/lib/api')
      let resolveCall: (v: unknown) => void
      vi.mocked(api.patch).mockImplementation(
        () => new Promise((r) => { resolveCall = r }),
      )

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      act(() => {
        result.current.renameMutation.mutate({
          key: 'shared-thread',
          label: 'Renamed desktop',
          environmentId: 'desktop',
        })
      })

      await waitFor(() => {
        const data = queryClient.getQueryData<GatewaySessionsResponse>(
          queryKeys.gatewaySessions,
        )
        expect(data?.sessions.find((s) => s.environmentId === 'local')?.label).toBe('Local shared thread')
        expect(data?.sessions.find((s) => s.environmentId === 'desktop')?.label).toBe('Renamed desktop')
      })
      expect(api.patch).toHaveBeenCalledWith('/api/gateway/sessions/shared-thread?environmentId=desktop', {
        label: 'Renamed desktop',
      })

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

      const data = queryClient.getQueryData<GatewaySessionsResponse>(
        queryKeys.gatewaySessions,
      )
      const filteredData = queryClient.getQueryData<GatewaySessionsResponse>(
        FILTERED_GATEWAY_SESSIONS_KEY,
      )
      expect(data?.sessions.find((s) => s.key === 'sess-1')?.label).toBe('Test Session')
      expect(filteredData?.sessions.find((s) => s.key === 'sess-1')?.label).toBe('Test Session')
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
        const filteredData = queryClient.getQueryData<typeof SEED_SESSIONS>(
          FILTERED_GATEWAY_SESSIONS_KEY,
        )
        expect(data?.sessions.find((s) => s.key === 'sess-1')).toBeUndefined()
        expect(data?.sessions).toHaveLength(1)
        expect(filteredData?.sessions.find((s) => s.key === 'sess-1')).toBeUndefined()
        expect(filteredData?.sessions).toHaveLength(1)
      })

      resolveCall!({ ok: true })
    })

    it('scopes optimistic deletes by environment when thread ids collide', async () => {
      const { Wrapper, queryClient } = createDuplicateThreadWrapper()
      const { api } = await import('@/lib/api')
      let resolveCall: (v: unknown) => void
      vi.mocked(api.del).mockImplementation(
        () => new Promise((r) => { resolveCall = r }),
      )

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      act(() => {
        result.current.deleteMutation.mutate({ key: 'shared-thread', environmentId: 'desktop' })
      })

      await waitFor(() => {
        const data = queryClient.getQueryData<typeof DUPLICATE_THREAD_SESSIONS>(
          queryKeys.gatewaySessions,
        )
        expect(data?.sessions).toHaveLength(1)
        expect(data?.sessions[0]?.environmentId).toBe('local')
      })
      expect(api.del).toHaveBeenCalledWith('/api/gateway/sessions/shared-thread?environmentId=desktop')

      resolveCall!({ ok: true })
    })

    it('removes cached chat history for deleted sessions', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.del).mockResolvedValue({ ok: true })
      const { Wrapper, queryClient } = createWrapper()
      queryClient.setQueryData([...queryKeys.chatHistory, 'sess-1'], { messages: [{ id: 'm1' }] })
      queryClient.setQueryData(queryKeys.sessionHistory('sess-1'), { messages: [{ id: 'm1' }] })

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.deleteMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.deleteMutation.isIdle).toBe(true))

      expect(queryClient.getQueryData([...queryKeys.chatHistory, 'sess-1'])).toBeUndefined()
      expect(queryClient.getQueryData(queryKeys.sessionHistory('sess-1'))).toBeUndefined()
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
      const filteredData = queryClient.getQueryData<typeof SEED_SESSIONS>(
        FILTERED_GATEWAY_SESSIONS_KEY,
      )
      expect(data?.sessions).toHaveLength(2)
      expect(data?.sessions.find((s) => s.key === 'sess-1')).toBeDefined()
      expect(filteredData?.sessions).toHaveLength(2)
      expect(filteredData?.sessions.find((s) => s.key === 'sess-1')).toBeDefined()
    })
  })

  describe('pinMutation', () => {
    it('calls api.patch with pinned state', async () => {
      const { api } = await import('@/lib/api')
      const { Wrapper } = createWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.pinMutation.mutate({ key: 'sess-1', pinned: true })
      })

      await waitFor(() => expect(result.current.pinMutation.isIdle).toBe(true))

      expect(api.patch).toHaveBeenCalledWith('/api/gateway/sessions/sess-1', {
        pinned: true,
        favorite: true,
      })
    })

    it('optimistically updates pinned state across gateway session caches', async () => {
      const { Wrapper, queryClient } = createWrapper()
      const { api } = await import('@/lib/api')
      let resolveCall: (v: unknown) => void
      vi.mocked(api.patch).mockImplementation(
        () => new Promise((r) => { resolveCall = r }),
      )

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      act(() => {
        result.current.pinMutation.mutate({ key: 'sess-1', pinned: true })
      })

      await waitFor(() => {
        const data = queryClient.getQueryData<typeof SEED_SESSIONS>(
          queryKeys.gatewaySessions,
        )
        const filteredData = queryClient.getQueryData<typeof SEED_SESSIONS>(
          FILTERED_GATEWAY_SESSIONS_KEY,
        )
        expect(data?.sessions.find((s) => s.key === 'sess-1')?.pinned).toBe(true)
        expect(data?.sessions.find((s) => s.key === 'sess-1')?.favorite).toBe(true)
        expect(filteredData?.sessions.find((s) => s.key === 'sess-1')?.pinned).toBe(true)
        expect(filteredData?.sessions.find((s) => s.key === 'sess-1')?.favorite).toBe(true)
      })

      resolveCall!({ ok: true })
    })

    it('scopes optimistic pin updates by environment when thread ids collide', async () => {
      const { Wrapper, queryClient } = createDuplicateThreadWrapper()
      const { api } = await import('@/lib/api')
      let resolveCall: (v: unknown) => void
      vi.mocked(api.patch).mockImplementation(
        () => new Promise((r) => { resolveCall = r }),
      )

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      act(() => {
        result.current.pinMutation.mutate({ key: 'shared-thread', pinned: true, environmentId: 'desktop' })
      })

      await waitFor(() => {
        const data = queryClient.getQueryData<typeof DUPLICATE_THREAD_SESSIONS>(
          queryKeys.gatewaySessions,
        )
        expect(data?.sessions.find((s) => s.environmentId === 'local')?.pinned).toBeUndefined()
        expect(data?.sessions.find((s) => s.environmentId === 'desktop')?.pinned).toBe(true)
      })
      expect(api.patch).toHaveBeenCalledWith('/api/gateway/sessions/shared-thread?environmentId=desktop', {
        pinned: true,
        favorite: true,
      })

      resolveCall!({ ok: true })
    })

    it('rolls back pinned cache updates on error', async () => {
      const { Wrapper, queryClient } = createWrapper()
      const { api } = await import('@/lib/api')
      vi.mocked(api.patch).mockRejectedValue(new Error('fail'))

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.pinMutation.mutate({ key: 'sess-1', pinned: true })
      })

      await waitFor(() => expect(result.current.pinMutation.isIdle).toBe(true))

      const data = queryClient.getQueryData<typeof SEED_SESSIONS>(
        queryKeys.gatewaySessions,
      )
      const filteredData = queryClient.getQueryData<typeof SEED_SESSIONS>(
        FILTERED_GATEWAY_SESSIONS_KEY,
      )
      expect(data?.sessions.find((s) => s.key === 'sess-1')?.pinned).toBeUndefined()
      expect(filteredData?.sessions.find((s) => s.key === 'sess-1')?.pinned).toBeUndefined()
      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: 'Failed to update pinned session' }),
      )
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

    it('passes environment when compacting colliding thread ids', async () => {
      const { api } = await import('@/lib/api')
      const { Wrapper } = createDuplicateThreadWrapper()

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.compactMutation.mutate({ key: 'shared-thread', environmentId: 'desktop' })
      })

      await waitFor(() => expect(result.current.compactMutation.isIdle).toBe(true))

      expect(api.post).toHaveBeenCalledWith('/api/gateway/sessions/shared-thread/compact?environmentId=desktop')
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

    it('refreshes cached chat history after compact succeeds', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.post).mockResolvedValue({ ok: true, data: { tokensSaved: 42 } })
      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderHook(() => useSessionMutations(), { wrapper: Wrapper })

      await act(async () => {
        result.current.compactMutation.mutate('sess-1')
      })

      await waitFor(() => expect(result.current.compactMutation.isIdle).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [...queryKeys.chatHistory, 'sess-1'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.sessionHistory('sess-1') })
      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Compacted — saved 42 tokens' }),
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
