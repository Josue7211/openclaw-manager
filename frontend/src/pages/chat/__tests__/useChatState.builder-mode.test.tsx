import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatState } from '../useChatState'

type UseChatStateOptions = NonNullable<Parameters<typeof useChatState>[1]>

const { mockApiGet, mockApiPost, mockFetch } = vi.hoisted(() => ({
  mockApiGet: vi.fn(async () => ({})),
  mockApiPost: vi.fn(async () => ({})),
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    patch: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    serviceLabel = 'Chat unavailable'
  },
  getRequestApiKeyForPath: () => '',
  getRequestBaseForPath: () => '',
}))

vi.mock('@/lib/hooks/useChatSocket', () => ({
  useChatSocket: () => ({ connected: false, usingFallback: false }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function okFetchResponse(payload: unknown = { ok: true }) {
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }
}

async function sendText(
  text: string,
  context?: UseChatStateOptions['context'],
) {
  const { result } = renderHook(
    () => useChatState(null, { blank: true, newChat: true, context }),
    { wrapper },
  )

  act(() => {
    result.current.setInput(text)
  })

  await waitFor(() => {
    expect(result.current.input).toBe(text)
  })

  act(() => {
    result.current.send()
  })

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object))
  })

  return JSON.parse(String((mockFetch.mock.calls.at(-1)?.[1] as RequestInit).body))
}

describe('useChatState builder mode intent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') return { models: [] }
      return {}
    })
    mockFetch.mockResolvedValue(okFetchResponse())
    vi.stubGlobal('fetch', mockFetch)
  })

  it('keeps generic widget questions on the normal Hermes chat path', async () => {
    const body = await sendText('what is a widget?')

    expect(body.text).toBe('what is a widget?')
    expect(body.newChat).toBe(true)
    expect(body.system_prompt).toBeUndefined()
  })

  it('uses the module builder only for explicit UI creation intent', async () => {
    const body = await sendText('make a dashboard card for appointments')

    expect(body.text).toBe('make a dashboard card for appointments')
    expect(body.system_prompt).toEqual(expect.stringContaining('ModuleProposal'))
  })

  it('sends stable project and environment identity with chat context', async () => {
    const body = await sendText('hello', {
      projectId: 'local:clawcontrol:stable',
      project: 'clawcontrol',
      projectRoot: '/Volumes/T7/projects',
      workingDir: '/Volumes/T7/projects/clawcontrol',
      environmentId: 'local',
      branch: 'main',
      runtime: 'Work locally',
    })

    expect(body).toEqual(expect.objectContaining({
      projectId: 'local:clawcontrol:stable',
      project: 'clawcontrol',
      projectRoot: '/Volumes/T7/projects',
      workingDir: '/Volumes/T7/projects/clawcontrol',
      environmentId: 'local',
      branch: 'main',
      runtime: 'Work locally',
    }))
  })
})
