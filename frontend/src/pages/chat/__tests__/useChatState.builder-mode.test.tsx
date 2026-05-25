import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatState } from '../useChatState'
import { optimisticAttachmentCacheKey } from '../optimisticAttachmentCache'

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
    patch: vi.fn(async () => ({})),
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

  it('keeps module-builder instructions on Hermes when stale local providers are present', async () => {
    localStorage.setItem('chat-provider', JSON.stringify('codex-cli'))
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') {
        return {
          models: [{ id: 'gpt-5.5', name: 'GPT 5.5' }],
          currentModel: 'gpt-5.5',
          providers: [
            { id: 'hermes', name: 'Hermes', ready: true, selectable: true },
            { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true },
          ],
        }
      }
      if (path === '/api/chat/providers/status') {
        return {
          providers: [
            { id: 'hermes', name: 'Hermes', ready: true, selectable: true },
            { id: 'codex-cli', name: 'Codex CLI', ready: true, selectable: true },
          ],
        }
      }
      return {}
    })

    const { result } = renderHook(
      () => useChatState(null, {
        blank: true,
        newChat: true,
        context: { workingDir: '/Users/josue/AgentShell' },
      }),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.provider).toBe('hermes')
    })

    act(() => {
      result.current.setInput('make a dashboard card for appointments')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object))
    })
    const body = JSON.parse(String((mockFetch.mock.calls.at(-1)?.[1] as RequestInit).body))

    expect(body.provider).toBe('hermes')
    expect(body.model).toBe('gpt-5.5')
    expect(body.system_prompt).toEqual(expect.stringContaining('ModuleProposal'))
    expect(body.workingDir).toBe('/Users/josue/AgentShell')
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

  it('sends attached text files as structured context files', async () => {
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('review this')
      result.current.setContextFiles([{
        id: 'ctx-1',
        name: 'Chat.tsx',
        path: 'frontend/src/pages/Chat.tsx',
        mimeType: 'text/typescript',
        size: 25,
        content: 'export default function Chat() {}',
      }])
    })

    await waitFor(() => {
      expect(result.current.contextFiles).toHaveLength(1)
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object))
    })
    const body = JSON.parse(String((mockFetch.mock.calls.at(-1)?.[1] as RequestInit).body))
    expect(body.contextFiles).toEqual([expect.objectContaining({
      name: 'Chat.tsx',
      path: 'frontend/src/pages/Chat.tsx',
      content: 'export default function Chat() {}',
    })])
  })

  it('keeps file context on failed optimistic messages for visible retry', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('review this')
      result.current.setContextFiles([{
        id: 'ctx-1',
        name: 'Chat.tsx',
        path: 'frontend/src/pages/Chat.tsx',
        content: 'export default function Chat() {}',
      }])
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        status: 'error',
        contextFiles: [expect.objectContaining({ name: 'Chat.tsx' })],
      }))
    })
  })

  it('stores repeated same-text image sends under sequenced optimistic cache keys', async () => {
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.sendMessage('compare screenshot', ['data:image/png;base64,one'])
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.current.sending).toBe(false)
    })

    act(() => {
      result.current.sendMessage('compare screenshot', ['data:image/png;base64,two'])
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    expect(result.current.optimisticImageCacheRef.current.get(
      optimisticAttachmentCacheKey('compare screenshot', 1),
    )).toEqual(['data:image/png;base64,one'])
    expect(result.current.optimisticImageCacheRef.current.get(
      optimisticAttachmentCacheKey('compare screenshot', 2),
    )).toEqual(['data:image/png;base64,two'])
    expect(result.current.optimisticImageCacheRef.current.get('compare screenshot')).toEqual(['data:image/png;base64,two'])
  })

  it('stores empty sequenced cache markers for same-text sends without attachments', async () => {
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.sendMessage('compare screenshot', ['data:image/png;base64,one'])
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.current.sending).toBe(false)
    })

    act(() => {
      result.current.sendMessage('compare screenshot')
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    expect(result.current.optimisticImageCacheRef.current.get(
      optimisticAttachmentCacheKey('compare screenshot', 1),
    )).toEqual(['data:image/png;base64,one'])
    expect(result.current.optimisticImageCacheRef.current.get(
      optimisticAttachmentCacheKey('compare screenshot', 2),
    )).toEqual([])
    expect(result.current.optimisticContextFileCacheRef.current.get(
      optimisticAttachmentCacheKey('compare screenshot', 2),
    )).toEqual([])
  })

  it('keeps module-builder system prompt when retrying failed UI creation requests', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(okFetchResponse())
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('make a dashboard card for invoices')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        status: 'error',
        text: 'make a dashboard card for invoices',
      }))
    })

    act(() => {
      result.current.retry(result.current.optimistic[0])
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    const retryBody = JSON.parse(String((mockFetch.mock.calls.at(-1)?.[1] as RequestInit).body))
    expect(retryBody.text).toBe('make a dashboard card for invoices')
    expect(retryBody.system_prompt).toEqual(expect.stringContaining('ModuleProposal'))
  })

  it('sends response-action prompts without clearing the current composer draft', async () => {
    const draftFile = {
      id: 'ctx-draft',
      name: 'Draft.tsx',
      path: 'frontend/src/pages/Draft.tsx',
      content: 'export const draft = true',
    }
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('unfinished draft')
      result.current.imagesRef.current = ['data:image/png;base64,draft']
      result.current.setImages(['data:image/png;base64,draft'])
      result.current.contextFilesRef.current = [draftFile]
      result.current.setContextFiles([draftFile])
    })

    await waitFor(() => {
      expect(result.current.input).toBe('unfinished draft')
      expect(result.current.contextFiles).toEqual([draftFile])
    })
    sessionStorage.setItem('chat-draft', 'unfinished draft')
    sessionStorage.setItem('chat-draft-images', JSON.stringify(['data:image/png;base64,draft']))
    sessionStorage.setItem('chat-draft-context-files', JSON.stringify([draftFile]))

    let sent = false
    act(() => {
      sent = result.current.sendMessage('Continue from your last response.')
    })

    expect(sent).toBe(true)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object))
    })
    const body = JSON.parse(String((mockFetch.mock.calls.at(-1)?.[1] as RequestInit).body))
    expect(body.text).toBe('Continue from your last response.')
    expect(body.images).toEqual([])
    expect(body.contextFiles).toBeUndefined()
    expect(result.current.input).toBe('unfinished draft')
    expect(result.current.imagesRef.current).toEqual(['data:image/png;base64,draft'])
    expect(result.current.contextFilesRef.current).toEqual([draftFile])
    expect(sessionStorage.getItem('chat-draft')).toBe('unfinished draft')
    expect(JSON.parse(sessionStorage.getItem('chat-draft-images') || '[]')).toEqual(['data:image/png;base64,draft'])
    expect(JSON.parse(sessionStorage.getItem('chat-draft-context-files') || '[]')).toEqual([draftFile])
  })

  it('sends a gateway abort for in-flight Hermes requests', async () => {
    mockFetch.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    const { result } = renderHook(
      () => useChatState('remote-session-1', {
        context: { workingDir: '/tmp/project' },
        sessionEnvironmentId: 'desktop',
      }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('long remote task')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        text: 'long remote task',
        status: 'sending',
      }))
    })

    act(() => {
      result.current.stop()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        status: 'cancelled',
      }))
    })
    expect(mockApiPost).toHaveBeenCalledWith('/api/chat/abort', {
      sessionKey: 'remote-session-1',
      environmentId: 'desktop',
    })
  })

  it('surfaces Hermes abort failures after marking the local send cancelled', async () => {
    mockFetch.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    }))
    mockApiPost.mockImplementation(async (path: string) => {
      if (path === '/api/chat/abort') throw new Error('abort route unavailable')
      return {}
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(
      () => useChatState('remote-session-1', { context: { workingDir: '/tmp/project' } }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('long remote task')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        text: 'long remote task',
        status: 'sending',
      }))
    })

    act(() => {
      result.current.stop()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        status: 'cancelled',
      }))
      expect(result.current.systemMsg).toBe('Stop requested, but Hermes Agent did not confirm cancellation.')
    })
    expect(mockApiPost).toHaveBeenCalledWith('/api/chat/abort', {
      sessionKey: 'remote-session-1',
    })
    consoleError.mockRestore()
  })

  it('normalizes stale local-provider send errors to Hermes project-folder guidance', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        provider: 'codex-cli',
        error: 'provider cwd is required',
      }),
    })
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('run the checks')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.optimistic[0]).toEqual(expect.objectContaining({
        status: 'error',
        error: 'Hermes Agent needs a project folder. Select or add a project before sending.',
      }))
      expect(result.current.systemMsg).toBe('Hermes Agent needs a project folder. Select or add a project before sending.')
    })
  })

  it('normalizes slash-command provider errors to Hermes Agent copy', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApiPost.mockRejectedValueOnce(new Error('codex-cli: unsupported provider'))
    const { result } = renderHook(
      () => useChatState(null, { blank: true, newChat: true }),
      { wrapper },
    )

    act(() => {
      result.current.setInput('/reset')
    })

    act(() => {
      result.current.send()
    })

    await waitFor(() => {
      expect(result.current.systemMsg).toBe('Hermes Agent is the active agent right now.')
    })
    consoleError.mockRestore()
  })
})
