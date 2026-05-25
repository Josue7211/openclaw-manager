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

import { gatewaySessionsPath, useGatewaySessions } from '../useGatewaySessions'
import { queryKeys } from '@/lib/query-keys'

function createWrapper(queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })) {
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
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: [] })

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

    // In demo mode, useGatewaySSE should still be called (React rules of hooks)
    // but with undefined to disable it
    expect(mockUseGatewaySSE).toHaveBeenCalled()
    const callArgs = mockUseGatewaySSE.mock.calls[0]
    expect(callArgs[0]).toBeUndefined()
  })

  it('returns demo data without calling API', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(true)

    const { api } = await import('@/lib/api')

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    expect(result.current.sessions).toEqual([])
    expect(result.current.available).toBe(false)
    expect(result.current.isLoading).toBe(false)
    // source field should NOT exist on the return value
    expect('source' in result.current).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('returns sessions from gateway response', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const mockSessions = [
      {
        key: 'sess-1',
        label: 'Test Session',
        agentKey: 'agent-primary',
        messageCount: 5,
        lastActivity: '2026-03-24T10:00:00Z',
      },
    ]

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: mockSessions })

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.sessions[0].key).toBe('sess-1')
    expect(result.current.sessions[0].label).toBe('Test Session')
    expect(result.current.sessions[0].agentKey).toBe('agent-primary')
    expect(result.current.sessions[0].messageCount).toBe(5)
    expect(result.current.available).toBe(true)
  })

  it('builds scoped session URLs with repeated cwd filters', () => {
    expect(gatewaySessionsPath({
      cwd: ['/Volumes/T7/projects/clawcontrol', '/Users/josue/AgentShell', '/Users/josue/AgentShell'],
      projectId: 'local:clawcontrol:stable',
      projectIds: ['local:agent-shell:stable', 'local:clawcontrol:stable'],
      project: 'clawcontrol',
      branch: 'codex/chat-parity',
      runtime: 'Work locally',
      environmentId: 'local',
      includeUnscoped: true,
    })).toBe('/api/gateway/sessions?cwd=%2FUsers%2Fjosue%2FAgentShell&cwd=%2FVolumes%2FT7%2Fprojects%2Fclawcontrol&projectId=local%3Aagent-shell%3Astable&projectId=local%3Aclawcontrol%3Astable&project=clawcontrol&branch=codex%2Fchat-parity&runtime=Work+locally&environmentId=local&includeUnscoped=1')
  })

  it('canonicalizes cwd filter path variants before querying sessions', () => {
    expect(gatewaySessionsPath({
      cwd: [
        '/Users/josue/AgentShell/',
        '/Users/josue/AgentShell',
        '\\Users\\josue\\AgentShell\\',
      ],
      includeUnscoped: true,
    })).toBe('/api/gateway/sessions?cwd=%2FUsers%2Fjosue%2FAgentShell&includeUnscoped=1')
  })

  it('requests scoped sessions when filters are provided', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: [] })

    renderHook(() => useGatewaySessions({
      cwd: ['/Volumes/T7/projects/clawcontrol'],
      includeUnscoped: true,
    }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/gateway/sessions?cwd=%2FVolumes%2FT7%2Fprojects%2Fclawcontrol&includeUnscoped=1')
    })
  })

  it('invalidates gateway session queries when the shared chat session event fires', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: [] })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useGatewaySessions({
      cwd: ['/Volumes/T7/projects/clawcontrol'],
      includeUnscoped: true,
    }), {
      wrapper: createWrapper(queryClient),
    })

    window.dispatchEvent(new CustomEvent('clawcontrol:chat-sessions-changed', {
      detail: { sessionKey: 'drawer-chat' },
    }))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.gatewaySessions })
    })
  })

  it('sorts sessions by lastActivity descending', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const mockSessions = [
      {
        key: 'sess-old',
        label: 'Old Session',
        agentKey: 'agent-primary',
        messageCount: 1,
        lastActivity: '2026-03-22T08:00:00Z',
      },
      {
        key: 'sess-new',
        label: 'New Session',
        agentKey: 'agent-primary',
        messageCount: 3,
        lastActivity: '2026-03-24T10:00:00Z',
      },
      {
        key: 'sess-mid',
        label: 'Mid Session',
        agentKey: 'agent-primary',
        messageCount: 2,
        lastActivity: '2026-03-23T15:00:00Z',
      },
    ]

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: mockSessions })

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Newest first
    expect(result.current.sessions[0].key).toBe('sess-new')
    expect(result.current.sessions[1].key).toBe('sess-mid')
    expect(result.current.sessions[2].key).toBe('sess-old')
  })

  it('sorts sessions with missing or invalid activity after dated sessions', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const mockSessions = [
      {
        key: 'sess-invalid',
        label: 'Invalid timestamp',
        agentKey: 'agent-primary',
        messageCount: 1,
        lastActivity: 'not-a-date',
      },
      {
        key: 'sess-new',
        label: 'New Session',
        agentKey: 'agent-primary',
        messageCount: 3,
        lastActivity: '2026-03-24T10:00:00Z',
      },
      {
        key: 'sess-missing',
        label: 'Missing timestamp',
        agentKey: 'agent-primary',
        messageCount: 1,
        lastActivity: '',
      },
    ]

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: mockSessions })

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.sessions.map((session) => session.key)).toEqual([
      'sess-new',
      'sess-invalid',
      'sess-missing',
    ])
  })

  it('returns available: false when gateway errors', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.available).toBe(false)
    expect(result.current.sessions).toEqual([])
  })

  it('has no source field in return type', async () => {
    const { isDemoMode } = await import('@/lib/demo-data')
    vi.mocked(isDemoMode).mockReturnValue(false)

    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ ok: true, sessions: [] })

    const { result } = renderHook(() => useGatewaySessions(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // The source field was removed — confirm it's not present
    expect('source' in result.current).toBe(false)
  })
})
