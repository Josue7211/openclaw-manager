import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const useChatSocketMock = vi.hoisted(() => vi.fn(() => ({ connected: false, usingFallback: false })))

vi.mock('@/lib/demo-data', () => ({
  isDemoMode: () => false,
  DEMO_CHAT_MESSAGES: [],
}))

vi.mock('@/lib/hooks/useChatSocket', () => ({
  useChatSocket: useChatSocketMock,
}))

vi.mock('@/features/chat/liveAppContext', () => ({
  buildLiveAppContext: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    serviceLabel = 'Hermes Agent unreachable'
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
            { id: 'hermes', name: 'Hermes Agent', description: 'Hermes Agent workspace chat', local: false, modelBacked: true },
          ],
        }
      }
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true, detail: 'Hermes ready' },
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
import { CHAT_FAVORITE_MODELS_VERSION, CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, CHAT_PRIMARY_MODEL_STORAGE_KEY } from '@/lib/model-favorites'
import { buildLiveAppContext } from '@/features/chat/liveAppContext'
import { buildChatRequestPayload, useChatState } from '../useChatState'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function mockHermesModels(models = [{ id: 'openai/gpt-5.5', name: 'GPT 5.5' }], currentModel = 'openai/gpt-5.5') {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/api/chat/models') {
      return {
        models,
        currentModel,
        providers: [
          { id: 'hermes', name: 'Hermes Agent', description: 'Hermes Agent workspace chat', local: false, modelBacked: true },
        ],
      }
    }
    if (path === '/api/chat/providers/status') {
      return {
        providers: [
          { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true, detail: 'Hermes ready' },
        ],
      }
    }
    if (path === '/api/chat/history') return { messages: [] }
    return {}
  })
}

describe('useChatState Hermes Agent provider behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useChatSocketMock.mockClear()
    useChatSocketMock.mockReturnValue({ connected: false, usingFallback: false })
    vi.mocked(buildLiveAppContext).mockResolvedValue('')
    mockHermesModels()
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}')) as { provider?: string; text?: string; sessionKey?: string }
      return new Response(JSON.stringify({
        ok: true,
        provider: body.provider,
        sessionKey: body.sessionKey || 'hermes-session-1',
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

  it('shows only Hermes before backend provider readiness has loaded', () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') return new Promise(() => undefined)
      if (path === '/api/chat/history') return { messages: [] }
      return {}
    })

    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    expect(result.current.providers.map(provider => provider.id)).toEqual(['hermes'])

    act(() => {
      result.current.setProvider('claudeAgent')
    })

    expect(result.current.provider).toBe('hermes')
  })

  it('sends selected Hermes Agent workspace metadata instead of a hardcoded cwd', async () => {
    vi.mocked(buildLiveAppContext).mockResolvedValue('screen context')
    const context = {
      projectId: 'remote:side-project:stable',
      project: 'side-project',
      projectRoot: '/Users/josue/projects',
      workingDir: '/Users/josue/projects/side-project',
      environmentId: 'hermes-vm',
      branch: 'feature/hermes-context',
      runtime: 'Hermes VM',
    }
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      newChat: true,
      context,
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.provider).toBe('hermes')
      expect(result.current.model).toBe('openai/gpt-5.5')
    })

    act(() => {
      result.current.setInput('use the selected project')
    })
    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    expect(buildLiveAppContext).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ context }))
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1]
    const body = JSON.parse(String(request?.body))
    expect(body).toEqual(expect.objectContaining({
      provider: 'hermes',
      model: 'openai/gpt-5.5',
      text: 'use the selected project',
      liveContext: 'screen context',
      newChat: true,
      ...context,
    }))
    expect(body.workingDir).not.toBe('/run/media/josue/T7/projects/clawctrl')
    expect(body.workingDir).not.toBe('/Volumes/T7/projects/clawctrl')
  })

  it('normalizes persisted display labels before sending chat requests', async () => {
    localStorage.setItem('chat-model', JSON.stringify('GPT 5.5'))
    localStorage.setItem(CHAT_PRIMARY_MODEL_STORAGE_KEY, JSON.stringify('GPT 5.5'))
    localStorage.setItem(CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, JSON.stringify(CHAT_FAVORITE_MODELS_VERSION))

    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    await waitFor(() => {
      expect(result.current.model).toBe('openai/gpt-5.5')
    })

    act(() => {
      result.current.setInput('do not send a display label')
    })
    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1]
    const body = JSON.parse(String(request?.body))
    expect(body.model).toBe('openai/gpt-5.5')
    expect(body.model).not.toBe('GPT 5.5')
  })

  it('ignores stale legacy local providers from readiness status', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') {
        return {
          models: [],
          currentModel: '',
          providers: [
            { id: 'hermes', name: 'Hermes Agent', description: 'Hermes Agent workspace chat', local: false, modelBacked: true },
          ],
        }
      }
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true, detail: 'Hermes ready' },
            { id: 'claudeAgent', name: 'Legacy local agent', ready: false, selectable: false, detail: 'Legacy local agent unavailable' },
            { id: 'codex-cli', name: 'Legacy local CLI', ready: true, selectable: true, detail: 'Legacy local CLI available' },
          ],
        }
      }
      if (path === '/api/chat/history') return { messages: [] }
      return {}
    })

    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.providers.map(candidate => candidate.id)).toEqual(['hermes'])
    })

    act(() => {
      result.current.setProvider('claudeAgent')
    })

    expect(result.current.provider).toBe('hermes')
  })

  it('replaces a stored legacy local provider with Hermes Agent without exposing the stale id', async () => {
    localStorage.setItem('chat-provider', JSON.stringify('claudeAgent'))

    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.provider).toBe('hermes')
      expect(result.current.systemMsg).toBe('Hermes Agent is the active agent right now.')
    })
  })

  it('explains unsupported provider selections with Hermes Agent wording', async () => {
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.providers.map(candidate => candidate.id)).toEqual(['hermes'])
    })

    act(() => {
      result.current.setProvider('claudeAgent')
    })

    expect(result.current.provider).toBe('hermes')
    expect(result.current.systemMsg).toBe('Hermes Agent is the active agent right now.')
  })

  it('scopes persisted session history, retry loads, and sockets by environment', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') {
        return {
          models: [],
          currentModel: '',
          providers: [
            { id: 'hermes', name: 'Hermes Agent', description: 'Hermes Agent workspace chat', local: false, modelBacked: true },
          ],
        }
      }
      if (path === '/api/chat/providers/status') {
        return { providers: [{ id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true }] }
      }
      if (path === '/api/gateway/sessions/shared-thread/history?limit=500&environmentId=desktop') {
        return {
          messages: [
            { id: 'desktop-message', role: 'assistant', text: 'desktop scoped reply', timestamp: '2026-05-21T12:00:00.000Z' },
          ],
        }
      }
      return { messages: [] }
    })

    const { result } = renderHook(() => useChatState('shared-thread', {
      sessionEnvironmentId: 'desktop',
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/gateway/sessions/shared-thread/history?limit=500&environmentId=desktop')
    })
    expect(useChatSocketMock).toHaveBeenCalledWith(expect.objectContaining({
      sessionKey: 'shared-thread',
      environmentId: 'desktop',
    }))

    act(() => {
      result.current.retryHistoryLoad()
    })

    await waitFor(() => {
      const scopedHistoryCalls = vi.mocked(api.get).mock.calls.filter(([path]) => (
        path === '/api/gateway/sessions/shared-thread/history?limit=500&environmentId=desktop'
      ))
      expect(scopedHistoryCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('scopes unsaved chat history by selected environment before a session key exists', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') {
        return {
          models: [],
          currentModel: '',
          providers: [
            { id: 'hermes', name: 'Hermes Agent', description: 'Hermes Agent workspace chat', local: false, modelBacked: true },
          ],
        }
      }
      if (path === '/api/chat/providers/status') {
        return { providers: [{ id: 'hermes', name: 'Hermes Agent', ready: true, selectable: true }] }
      }
      if (path === '/api/chat/history?environmentId=desktop') {
        return {
          messages: [
            { id: 'desktop-unsaved', role: 'assistant', text: 'desktop unsaved reply', timestamp: '2026-05-21T12:00:00.000Z' },
          ],
        }
      }
      return { messages: [] }
    })

    renderHook(() => useChatState(null, {
      sessionEnvironmentId: 'desktop',
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/chat/history?environmentId=desktop')
    })
    expect(useChatSocketMock).toHaveBeenCalledWith(expect.objectContaining({
      sessionKey: null,
      environmentId: 'desktop',
    }))
  })

  it('surfaces background model sync failures instead of only logging them', async () => {
    localStorage.setItem('chat-model', JSON.stringify('gpt-5.4'))
    localStorage.setItem(CHAT_PRIMARY_MODEL_STORAGE_KEY, JSON.stringify('gpt-5.4'))
    localStorage.setItem(CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, JSON.stringify(CHAT_FAVORITE_MODELS_VERSION))
    mockHermesModels([
      { id: 'openai/gpt-5.5', name: 'GPT 5.5' },
      { id: 'gpt-5.4', name: 'GPT 5.4' },
    ])
    vi.mocked(api.post).mockRejectedValueOnce(new Error('model route unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    await waitFor(() => {
      expect(result.current.systemMsg).toBe('Model change did not reach Hermes Agent. Check Hermes settings and try again.')
    })
    expect(api.post).toHaveBeenCalledWith('/api/chat/model', { model: 'gpt-5.4' })

    consoleError.mockRestore()
  })

  it('restores the previous model and shows status when a selected model fails to apply', async () => {
    localStorage.setItem('chat-model', JSON.stringify('openai/gpt-5.5'))
    localStorage.setItem(CHAT_PRIMARY_MODEL_STORAGE_KEY, JSON.stringify('openai/gpt-5.5'))
    localStorage.setItem(CHAT_FAVORITE_MODELS_VERSION_STORAGE_KEY, JSON.stringify(CHAT_FAVORITE_MODELS_VERSION))
    mockHermesModels([
      { id: 'openai/gpt-5.5', name: 'GPT 5.5' },
      { id: 'gpt-5.4', name: 'GPT 5.4' },
    ])
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })

    await waitFor(() => {
      expect(result.current.model).toBe('openai/gpt-5.5')
    })
    vi.mocked(api.patch).mockClear()
    vi.mocked(api.post).mockClear()
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('runtime config unavailable'))

    act(() => {
      result.current.setModel('gpt-5.4')
    })

    await waitFor(() => {
      expect(result.current.systemMsg).toBe('Model change failed. The previous model was restored.')
    })
    expect(result.current.model).toBe('openai/gpt-5.5')
    expect(api.patch).toHaveBeenCalledWith('/api/hermes/runtime-config', { chatPrimaryModel: 'gpt-5.4' })
    expect(api.post).not.toHaveBeenCalledWith('/api/chat/model', { model: 'gpt-5.4' })

    consoleError.mockRestore()
  })

  it('clears the local view for /clear without sending the command to Hermes', async () => {
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: {},
    }), { wrapper })

    await waitFor(() => {
      expect(result.current.providers.some(candidate => candidate.id === 'hermes')).toBe(true)
    })

    act(() => {
      result.current.setProvider('hermes')
      result.current.setInput('/clear')
    })

    vi.mocked(api.post).mockClear()

    act(() => {
      result.current.send()
    })

    expect(result.current.messages).toEqual([])
    expect(result.current.optimistic).toEqual([])
    expect(result.current.input).toBe('')
    expect(result.current.systemMsg).toBe('\u2500\u2500 Chat view cleared \u2500\u2500')
    expect(api.post).not.toHaveBeenCalledWith('/api/chat', expect.anything())
  })

  it('surfaces live app context capture failures while still sending the Hermes message', async () => {
    vi.mocked(buildLiveAppContext).mockRejectedValueOnce(new Error('context unavailable'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useChatState(null, {
      blank: true,
      context: { workingDir: '/Volumes/T7/projects/clawctrl' },
    }), { wrapper })

    act(() => {
      result.current.setInput('send without live context')
    })
    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.systemMsg).toBe('Live app context could not be attached. Sending without current screen context.')
      expect(fetch).toHaveBeenCalled()
    })
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1]
    expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
      provider: 'hermes',
      text: 'send without live context',
      liveContext: '',
    }))

    consoleWarn.mockRestore()
  })

  it('retries failed Hermes sends with the original project context snapshot', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Hermes send failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        provider: 'hermes',
        sessionKey: 'retry-session-1',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const projectA = {
      projectId: 'project-a',
      project: 'Project A',
      projectRoot: '/tmp/project-a',
      workingDir: '/tmp/project-a',
      environmentId: 'desktop-a',
      branch: 'main',
      runtime: 'Work locally',
    }
    const projectB = {
      projectId: 'project-b',
      project: 'Project B',
      projectRoot: '/tmp/project-b',
      workingDir: '/tmp/project-b',
      environmentId: 'desktop-b',
      branch: 'main',
      runtime: 'Work locally',
    }

    const { result, rerender } = renderHook(
      ({ context }) => useChatState(null, { blank: true, newChat: true, context }),
      { wrapper, initialProps: { context: projectA } },
    )

    await waitFor(() => {
      expect(result.current.provider).toBe('hermes')
    })

    act(() => {
      result.current.setInput('retry in the original folder')
    })
    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toMatchObject({
        status: 'error',
        context: expect.objectContaining({ workingDir: '/tmp/project-a' }),
      })
    })

    rerender({ context: projectB })

    await act(async () => {
      await result.current.retry(result.current.optimistic[0])
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    const retryRequest = vi.mocked(fetch).mock.calls.at(-1)?.[1]
    const retryBody = JSON.parse(String(retryRequest?.body))
    expect(retryBody).toEqual(expect.objectContaining({
      text: 'retry in the original folder',
      projectId: 'project-a',
      project: 'Project A',
      projectRoot: '/tmp/project-a',
      workingDir: '/tmp/project-a',
      environmentId: 'desktop-a',
    }))
    expect(retryBody.workingDir).not.toBe('/tmp/project-b')
    expect(buildLiveAppContext).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({
      context: expect.objectContaining({ workingDir: '/tmp/project-a' }),
    }))
  })
})

describe('buildChatRequestPayload', () => {
  it('normalizes GPT 5.5 display labels before adding a model field', () => {
    expect(buildChatRequestPayload({
      text: 'use canonical model id',
      images: [],
      model: 'GPT 5.5',
      provider: 'hermes',
      providerIsModelBacked: true,
    })).toEqual({
      text: 'use canonical model id',
      images: [],
      provider: 'hermes',
      model: 'openai/gpt-5.5',
    })
  })

  it('keeps model only for Hermes model-backed requests while preserving request instructions', () => {
    expect(buildChatRequestPayload({
      text: 'build a widget',
      images: [],
      model: 'openai/gpt-5.5',
      provider: 'hermes',
      providerIsModelBacked: true,
      systemPrompt: 'module builder',
      liveContext: 'screen context',
    })).toEqual({
      text: 'build a widget',
      images: [],
      provider: 'hermes',
      model: 'openai/gpt-5.5',
      system_prompt: 'module builder',
      liveContext: 'screen context',
    })
  })
})
