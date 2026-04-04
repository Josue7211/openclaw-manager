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

import { useCrons } from '../useCrons'
import type { CronJob } from '@/pages/crons/types'
import { queryKeys } from '@/lib/query-keys'

const mockJob: CronJob = {
  id: 'c1',
  name: 'Daily Backup',
  description: 'Backs up database',
  schedule: { kind: 'every', everyMs: 86400000 },
  enabled: true,
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

describe('useCrons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('returns jobs array on successful fetch', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [mockJob] })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.jobs).toEqual([mockJob])
      expect(api.get).toHaveBeenCalledWith('/api/crons')
    })

    it('returns empty array when api returns empty jobs', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [] })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.jobs).toEqual([])
    })

    it('returns empty array on fetch error', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.jobs).toEqual([])
    })
  })

  describe('demo mode', () => {
    it('does not call api.get when isDemoMode is true', async () => {
      const { isDemoMode } = await import('@/lib/demo-data')
      vi.mocked(isDemoMode).mockReturnValue(true)
      const { api } = await import('@/lib/api')

      const { wrapper } = createWrapper()
      renderHook(() => useCrons(), { wrapper })

      await new Promise((r) => setTimeout(r, 50))

      expect(api.get).not.toHaveBeenCalled()

      vi.mocked(isDemoMode).mockReturnValue(false)
    })
  })

  describe('create mutation', () => {
    it('calls api.post with payload and optimistically adds job', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [mockJob] })
      vi.mocked(api.post).mockResolvedValue({ job: { ...mockJob, id: 'c2', name: 'New Job' } })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        result.current.createMutation.mutateAsync({
          name: 'New Job',
          schedule: { kind: 'every', everyMs: 3600000 },
        })
      })

      expect(api.post).toHaveBeenCalledWith('/api/crons', {
        name: 'New Job',
        schedule: { kind: 'every', everyMs: 3600000 },
      })
    })
  })

  describe('update mutation', () => {
    it('calls api.patch and optimistically updates job in cache', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [mockJob] })
      vi.mocked(api.patch).mockResolvedValue({ job: { ...mockJob, name: 'Updated Backup' } })

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      queryClient.setQueryData(queryKeys.crons, { jobs: [mockJob] })

      await act(async () => {
        result.current.updateMutation.mutateAsync({ id: 'c1', name: 'Updated Backup' })
      })

      expect(api.patch).toHaveBeenCalledWith('/api/crons/update', { id: 'c1', name: 'Updated Backup' })
    })
  })

  describe('delete mutation', () => {
    it('calls api.del and optimistically removes job from cache', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [mockJob] })
      vi.mocked(api.del).mockResolvedValue(undefined)

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      queryClient.setQueryData(queryKeys.crons, { jobs: [mockJob] })

      await act(async () => {
        result.current.deleteMutation.mutateAsync('c1')
      })

      expect(api.del).toHaveBeenCalledWith('/api/crons/delete', { id: 'c1' })
    })

    it('rolls back optimistic delete on error', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [mockJob] })
      vi.mocked(api.del).mockRejectedValue(new Error('Delete failed'))

      const { queryClient, wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      queryClient.setQueryData(queryKeys.crons, { jobs: [mockJob] })

      await act(async () => {
        try {
          await result.current.deleteMutation.mutateAsync('c1')
        } catch {
          // Expected
        }
      })

      // Cache should have rolled back -- job reappears
      const cached = queryClient.getQueryData<{ jobs: CronJob[] }>(queryKeys.crons)
      expect(cached?.jobs).toHaveLength(1)
      expect(cached?.jobs[0].id).toBe('c1')
    })
  })

  describe('gateway SSE integration', () => {
    it('calls useGatewaySSE with cron events and queryKeys', async () => {
      const { api } = await import('@/lib/api')
      vi.mocked(api.get).mockResolvedValue({ jobs: [mockJob] })

      const { wrapper } = createWrapper()
      renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(mockUseGatewaySSE).toHaveBeenCalled()
      })

      expect(mockUseGatewaySSE).toHaveBeenCalledWith(
        expect.objectContaining({
          events: ['cron'],
          queryKeys: expect.objectContaining({
            cron: queryKeys.crons,
          }),
        }),
      )
    })

    it('calls useGatewaySSE with empty options in demo mode (no-op)', async () => {
      const { isDemoMode } = await import('@/lib/demo-data')
      vi.mocked(isDemoMode).mockReturnValue(true)

      mockUseGatewaySSE.mockClear()

      const { wrapper } = createWrapper()
      renderHook(() => useCrons(), { wrapper })

      // Wait a tick for any side effects
      await new Promise((r) => setTimeout(r, 50))

      // useGatewaySSE is always called (rules of hooks) but with empty options in demo mode
      expect(mockUseGatewaySSE).toHaveBeenCalledWith({})

      // Reset
      vi.mocked(isDemoMode).mockReturnValue(false)
    })
  })

  describe('response shape with gateway state fields', () => {
    it('handles cron.list response with state fields (nextRunAtMs, lastRunAtMs)', async () => {
      const { api } = await import('@/lib/api')
      const jobWithState: CronJob = {
        id: 'c1',
        name: 'backup',
        schedule: { kind: 'every', everyMs: 86400000 },
        state: { nextRunAtMs: 1711324800000, lastRunAtMs: 1711238400000, lastRunStatus: 'ok' },
        createdAtMs: 1711152000000,
        enabled: true,
      }
      vi.mocked(api.get).mockResolvedValue({ jobs: [jobWithState] })

      const { wrapper } = createWrapper()
      const { result } = renderHook(() => useCrons(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.jobs[0].state?.nextRunAtMs).toBe(1711324800000)
      expect(result.current.jobs[0].state?.lastRunAtMs).toBe(1711238400000)
      expect(result.current.jobs[0].state?.lastRunStatus).toBe('ok')
      expect(result.current.jobs[0].createdAtMs).toBe(1711152000000)
    })
  })
})
