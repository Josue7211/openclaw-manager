import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => false,
  DEMO_CHAT_MESSAGES: [],
}))

vi.mock('@/lib/hooks/useChatSocket', () => ({
  useChatSocket: () => ({ connected: false, usingFallback: false }),
}))

vi.mock('../live-app-context', () => ({
  buildLiveAppContext: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    serviceLabel = 'Harness unreachable'
    constructor(public status: number, public body: unknown) {
      super(String(status))
    }
  },
  getRequestApiKeyForPath: vi.fn(() => 'test-key'),
  getRequestBaseForPath: vi.fn(() => 'http://127.0.0.1:3010'),
  api: {
    get: vi.fn(async (path: string) => {
      if (path === '/api/chat/models') {
        return {
          models: [],
          currentModel: '',
          providers: [
            { id: 'hermes', name: 'Hermes', description: 'Codex LB backed chat', local: false, modelBacked: true },
            { id: 'claudeAgent', name: 'Claude Code', description: 'T3 Claude Code provider', local: true, modelBacked: false },
            { id: 'codex-cli', name: 'Codex CLI', description: 'Direct local Codex CLI provider', local: true, modelBacked: false },
          ],
        }
      }
      if (path === '/api/chat/history') return { messages: [] }
      return {}
    }),
    post: vi.fn(async () => ({ ok: true })),
    patch: vi.fn(async () => ({ ok: true })),
  },
}))

import { api } from '@/lib/api'
import { buildChatRequestPayload, useChatState } from '../useChatState'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useChatState direct local provider replies', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') {
        return {
          models: [],
          currentModel: '',
          providers: [
            { id: 'hermes', name: 'Hermes', description: 'Codex LB backed chat', local: false, modelBacked: true },
            { id: 'claudeAgent', name: 'Claude Code', description: 'T3 Claude Code provider', local: true, modelBacked: false },
            { id: 'codex-cli', name: 'Codex CLI', description: 'Direct local Codex CLI provider', local: true, modelBacked: false },
          ],
        }
      }
      if (path === '/api/chat/history') return { messages: [] }
      return {}
    })
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { provider?: string }
      return new Response(JSON.stringify({
        ok: true,
        provider: body.provider,
        reply: `${body.provider} reply`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it.each(['claudeAgent', 'codex-cli'] as const)('sends %s and renders its direct reply without leaving typing on', async (provider) => {
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawcontrol' },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.providers.some(candidate => candidate.id === provider)).toBe(true)
    })

    act(() => {
      result.current.setProvider(provider)
      result.current.setInput('hello local provider')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.messages.map(message => [message.role, message.text])).toEqual([
        ['user', 'hello local provider'],
        ['assistant', `${provider} reply`],
      ])
    })

    expect(result.current.messages.every(message => message.localOnly)).toBe(true)

    expect(result.current.isTyping).toBe(false)
    expect(result.current.sending).toBe(false)
    expect(result.current.optimistic).toEqual([])
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3010/api/chat', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-API-Key': 'test-key' }),
    }))
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1]
    const body = JSON.parse(String(request?.body))
    expect(body).toEqual(expect.objectContaining({
      provider,
      text: 'hello local provider',
      workingDir: '/Volumes/T7/projects/clawcontrol',
    }))
    expect(body).not.toHaveProperty('model')
  })

  it('shows only Hermes before backend provider readiness has loaded', () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') {
        return new Promise(() => undefined)
      }
      if (path === '/api/chat/history') return { messages: [] }
      return {}
    })

    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawcontrol' },
    }), { wrapper })

    expect(result.current.providers.map(provider => provider.id)).toEqual(['hermes'])

    act(() => {
      result.current.setProvider('claudeAgent')
    })

    expect(result.current.provider).toBe('hermes')
  })

  it('does not sync Hermes model settings while a direct local provider is selected', async () => {
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawcontrol' },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.providers.some(candidate => candidate.id === 'claudeAgent')).toBe(true)
    })

    act(() => {
      result.current.setProvider('claudeAgent')
    })

    await waitFor(() => {
      expect(result.current.provider).toBe('claudeAgent')
    })

    vi.mocked(api.patch).mockClear()
    vi.mocked(api.post).mockClear()

    act(() => {
      result.current.setModel('gpt-5.5')
    })

    expect(api.patch).not.toHaveBeenCalledWith('/api/harness/runtime-config', expect.anything())
    expect(api.post).not.toHaveBeenCalledWith('/api/chat/model', expect.anything())
  })
})

describe('buildChatRequestPayload', () => {
  it('keeps model and system prompt only for Hermes model-backed requests', () => {
    expect(buildChatRequestPayload({
      text: 'build a widget',
      images: [],
      model: 'gpt-5.5',
      provider: 'hermes',
      providerIsModelBacked: true,
      systemPrompt: 'module builder',
      liveContext: 'screen context',
    })).toEqual({
      text: 'build a widget',
      images: [],
      provider: 'hermes',
      model: 'gpt-5.5',
      system_prompt: 'module builder',
      liveContext: 'screen context',
    })
  })

  it.each(['claudeAgent', 'codex-cli'] as const)('omits model payload for direct local provider %s', (provider) => {
    expect(buildChatRequestPayload({
      text: 'hello',
      images: [],
      model: 'gpt-5.5',
      provider,
      providerIsModelBacked: false,
      systemPrompt: 'module builder',
      liveContext: '',
    })).toEqual({
      text: 'hello',
      images: [],
      provider,
      liveContext: '',
    })
  })
})
