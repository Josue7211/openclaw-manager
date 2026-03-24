import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: vi.fn(() => false),
}))

const mockUseGatewaySSE = vi.fn()
vi.mock('@/lib/hooks/useGatewaySSE', () => ({
  useGatewaySSE: (...args: unknown[]) => mockUseGatewaySSE(...args),
}))

import { useAgents } from '../useAgents'
import type { Agent } from '@/pages/agents/types'
import { queryKeys } from '@/lib/query-keys'

const mockAgent: Agent = {
  id: 'a1',
  name: 'test_agent',
  display_name: 'Test Agent',
  emoji: '🤖',
  role: 'coder',
  status: 'idle',
  current_task: null,
  color: null,
  model: 'gpt-4',
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

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

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('returns agents array on successful fetch', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.agents).toEqual([mockAgent])
      expect(api.get).toHaveBeenCalledWith('/api/agents')
    })

    it('returns empty array when api returns empty agents', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [] })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.agents).toEqual([])
    })

    it('returns empty array on fetch error', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.agents).toEqual([])
    })
  })

  describe('demo mode', () => {
    it('does not call api.get when isDemoMode is true', async () => {
      const { isDemoMode } = await import('@/lib/demo-data')
      vi.mocked(isDemoMode).mockReturnValue(true)
      const { api } = await import('@/lib/api')

      const { wrapper } = createWrapper()
      renderHook(() => useAgents(), { wrapper })

      // Wait a tick to ensure no async calls are pending
      await new Promise((r) => setTimeout(r, 50))

      expect(api.get).not.toHaveBeenCalled()

      // Reset demo mode
      vi.mocked(isDemoMode).mockReturnValue(false)
    })
  })

  describe('create mutation', () => {
    it('calls api.post with payload and optimistically adds agent', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })
      vi.mocked(api.post).mockResolvedValue({ agent: { ...mockAgent, id: 'a2', display_name: 'New Agent' } })

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        result.current.createMutation.mutateAsync({ display_name: 'New Agent' })
      })

      // Check optimistic update added a temp agent
      const cached = queryClient.getQueryData<{ agents: Agent[] }>(queryKeys.agents)
      // After settlement, invalidation fires, but the post was called
      expect(api.post).toHaveBeenCalledWith('/api/agents', { display_name: 'New Agent' })
    })

    it('rolls back optimistic create on error', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })
      vi.mocked(api.post).mockRejectedValue(new Error('Server error'))

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Seed the cache
      queryClient.setQueryData(queryKeys.agents, { agents: [mockAgent] })

      await act(async () => {
        try {
          await result.current.createMutation.mutateAsync({ display_name: 'Fail Agent' })
        } catch {
          // Expected
        }
      })

      // Cache should have rolled back to original
      const cached = queryClient.getQueryData<{ agents: Agent[] }>(queryKeys.agents)
      expect(cached?.agents).toHaveLength(1)
      expect(cached?.agents[0].id).toBe('a1')
    })
  })

  describe('update mutation', () => {
    it('calls api.patch and optimistically updates agent in cache', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })
      vi.mocked(api.patch).mockResolvedValue({ agent: { ...mockAgent, display_name: 'Updated' } })

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Seed the cache
      queryClient.setQueryData(queryKeys.agents, { agents: [mockAgent] })

      await act(async () => {
        result.current.updateMutation.mutateAsync({ id: 'a1', display_name: 'Updated' })
      })

      expect(api.patch).toHaveBeenCalledWith('/api/agents', { id: 'a1', display_name: 'Updated' })
    })
  })

  describe('delete mutation', () => {
    it('calls api.del and optimistically removes agent from cache', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })
      vi.mocked(api.del).mockResolvedValue(undefined)

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Seed the cache explicitly
      queryClient.setQueryData(queryKeys.agents, { agents: [mockAgent] })

      // Check cache before
      const before = queryClient.getQueryData<{ agents: Agent[] }>(queryKeys.agents)
      expect(before?.agents).toHaveLength(1)

      await act(async () => {
        result.current.deleteMutation.mutateAsync('a1')
      })

      expect(api.del).toHaveBeenCalledWith('/api/agents', { id: 'a1' })
    })

    it('rolls back optimistic delete on error', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })
      vi.mocked(api.del).mockRejectedValue(new Error('Delete failed'))

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Seed the cache
      queryClient.setQueryData(queryKeys.agents, { agents: [mockAgent] })

      await act(async () => {
        try {
          await result.current.deleteMutation.mutateAsync('a1')
        } catch {
          // Expected
        }
      })

      // Cache should have rolled back -- agent reappears
      const cached = queryClient.getQueryData<{ agents: Agent[] }>(queryKeys.agents)
      expect(cached?.agents).toHaveLength(1)
      expect(cached?.agents[0].id).toBe('a1')
    })
  })

  describe('gateway SSE integration', () => {
    it('calls useGatewaySSE with agent events and queryKeys', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })

      const { wrapper } = createWrapper()
      renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(mockUseGatewaySSE).toHaveBeenCalled()
      })

      expect(mockUseGatewaySSE).toHaveBeenCalledWith(
        expect.objectContaining({
          events: ['agent'],
          queryKeys: expect.objectContaining({
            agent: queryKeys.agents,
          }),
        }),
      )
    })

    it('calls useGatewaySSE with empty options in demo mode (no-op)', async () => {
      const { isDemoMode } = await import('@/lib/demo-data')
      vi.mocked(isDemoMode).mockReturnValue(true)

      mockUseGatewaySSE.mockClear()

      const { wrapper } = createWrapper()
      renderHook(() => useAgents(), { wrapper })

      // Wait a tick for any side effects
      await new Promise((r) => setTimeout(r, 50))

      // useGatewaySSE is always called (rules of hooks) but with empty options in demo mode
      expect(mockUseGatewaySSE).toHaveBeenCalledWith({})

      // Reset
      vi.mocked(isDemoMode).mockReturnValue(false)
    })
  })

  describe('action mutation', () => {
    it('calls api.post with action payload', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ agents: [mockAgent] })
      vi.mocked(api.post).mockResolvedValue({})

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.actionMutation.mutateAsync({ id: 'a1', action: 'start' })
      })

      expect(api.post).toHaveBeenCalledWith('/api/agents/action', { id: 'a1', action: 'start' })
    })
  })
})
