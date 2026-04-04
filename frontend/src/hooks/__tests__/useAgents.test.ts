import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// Mock demo-data before importing useAgents
vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => false,
}))

// Mock useGatewaySSE — EventSource is not available in the test environment
vi.mock('@/lib/hooks/useGatewaySSE', () => ({
  useGatewaySSE: vi.fn(),
}))

// Mock api module
const mockGet = vi.fn()
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
  API_BASE: 'http://localhost:3000',
  getApiKey: () => 'test-key',
  setApiKey: vi.fn(),
}))

import { useAgents } from '../useAgents'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('response shape', () => {
    it('maps a full backend response with all fields populated', async () => {
      const backendResponse = {
        agents: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'codebot',
            display_name: 'CodeBot',
            emoji: '\uD83E\uDD16',
            role: 'developer',
            status: 'active',
            current_task: 'Refactoring auth module',
            model: 'claude-sonnet-4-6',
            color: '#5865f2',
            sort_order: 0,
            created_at: '2026-03-15T10:00:00Z',
            updated_at: '2026-03-15T12:00:00Z',
          },
        ],
      }

      mockGet.mockResolvedValueOnce(backendResponse)

      const { result } = renderHook(() => useAgents(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.agents).toHaveLength(1)
      const agent = result.current.agents[0]
      expect(agent.id).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(agent.name).toBe('codebot')
      expect(agent.display_name).toBe('CodeBot')
      expect(agent.emoji).toBe('\uD83E\uDD16')
      expect(agent.role).toBe('developer')
      expect(agent.status).toBe('active')
      expect(agent.current_task).toBe('Refactoring auth module')
      expect(agent.model).toBe('claude-sonnet-4-6')
      expect(agent.color).toBe('#5865f2')
      expect(agent.sort_order).toBe(0)
      expect(agent.created_at).toBe('2026-03-15T10:00:00Z')
      expect(agent.updated_at).toBe('2026-03-15T12:00:00Z')
    })

    it('handles null optional fields without errors', async () => {
      const backendResponse = {
        agents: [
          {
            id: 'agent-2',
            name: 'idle_agent',
            display_name: 'Idle Agent',
            emoji: '\uD83D\uDCA4',
            role: 'monitor',
            status: 'idle',
            current_task: null,
            model: null,
            color: null,
            sort_order: 1,
            created_at: '2026-03-15T10:00:00Z',
            updated_at: '2026-03-15T10:00:00Z',
          },
        ],
      }

      mockGet.mockResolvedValueOnce(backendResponse)

      const { result } = renderHook(() => useAgents(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.agents).toHaveLength(1)
      const agent = result.current.agents[0]
      expect(agent.current_task).toBeNull()
      expect(agent.model).toBeNull()
      expect(agent.color).toBeNull()
    })

    it('returns empty array when backend returns no agents', async () => {
      mockGet.mockResolvedValueOnce({ agents: [] })

      const { result } = renderHook(() => useAgents(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.agents).toEqual([])
    })
  })
})
