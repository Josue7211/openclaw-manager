import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatState } from '../useChatState'

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: vi.fn(),
    patch: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    serviceLabel = 'Chat unavailable'
  },
  getRequestApiKeyForPath: () => '',
  getRequestBaseForPath: () => '',
}))

vi.mock('@/lib/hooks/useChatSocket', () => ({
  useChatSocket: () => ({ connected: false, usingFallback: true }),
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

function createScroller() {
  const el = document.createElement('div')
  const scrollTo = vi.fn()
  Object.defineProperties(el, {
    scrollHeight: { configurable: true, value: 1600 },
    clientHeight: { configurable: true, value: 400 },
    scrollTo: { configurable: true, value: scrollTo },
  })
  return { el, scrollTo }
}

function historyWithAssistantReply() {
  return {
    messages: [
      {
        id: 'm-1',
        role: 'assistant',
        text: 'Here is the latest reply.',
        timestamp: new Date('2026-05-16T22:00:00Z').toISOString(),
      },
    ],
  }
}

function historyWithDuplicateAssistantReply() {
  return {
    messages: [
      {
        id: 'm-1',
        role: 'assistant',
        text: 'Hey. What do you need?',
        timestamp: new Date('2026-05-16T22:00:00Z').toISOString(),
      },
      {
        id: 'm-2',
        role: 'assistant',
        text: 'Hey. What do you need?',
        timestamp: new Date('2026-05-16T22:00:02Z').toISOString(),
      },
      {
        id: 'm-3',
        role: 'assistant',
        text: 'Hey. What do you need?',
        timestamp: new Date('2026-05-16T22:03:00Z').toISOString(),
      },
    ],
  }
}

function historyWithToolRows() {
  return {
    messages: [
      {
        id: 'assistant-1',
        role: 'assistant',
        text: 'Searching files.',
        timestamp: new Date('2026-05-16T22:00:00Z').toISOString(),
        turnId: 'turn-1',
      },
      {
        id: 'tool-row-1',
        role: 'tool',
        content: '3 matches',
        timestamp: new Date('2026-05-16T22:00:01Z').toISOString(),
        toolName: 'rg',
        toolCallId: 'call-rg-1',
      },
      {
        id: 'tool-row-duplicate',
        role: 'tool',
        content: '3 matches',
        timestamp: new Date('2026-05-16T22:00:02Z').toISOString(),
        tool_name: 'rg',
        tool_call_id: 'call-rg-1',
      },
    ],
  }
}

describe('useChatState scroll behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') return { models: [] }
      if (path === '/api/chat/history') return historyWithAssistantReply()
      return {}
    })
  })

  it('keeps the thread pinned to the bottom when new history arrives at bottom', async () => {
    const { el, scrollTo } = createScroller()
    const { result } = renderHook(() => useChatState(null), { wrapper })

    act(() => {
      result.current.scrollRef.current = el
      result.current.setAtBottom(true)
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 1600, behavior: 'auto' })
    })
  })

  it('does not auto-scroll when the reader has moved away from bottom', async () => {
    let resolveHistory: (value: ReturnType<typeof historyWithAssistantReply>) => void
    mockApiGet.mockImplementation((path: string) => {
      if (path === '/api/chat/models') return Promise.resolve({ models: [] })
      if (path === '/api/chat/history') {
        return new Promise((resolve) => {
          resolveHistory = resolve
        })
      }
      return Promise.resolve({})
    })

    const { el, scrollTo } = createScroller()
    const { result } = renderHook(() => useChatState(null), { wrapper })

    act(() => {
      result.current.scrollRef.current = el
      result.current.setAtBottom(false)
      resolveHistory!(historyWithAssistantReply())
    })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1)
    })

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('dedupes repeated assistant transcript rows from history without hiding later repeats', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') return { models: [] }
      if (path === '/api/chat/history') return historyWithDuplicateAssistantReply()
      return {}
    })

    const { result } = renderHook(() => useChatState(null), { wrapper })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    expect(result.current.messages.map((message) => message.id)).toEqual(['m-1', 'm-3'])
  })

  it('preserves unmatched tool transcript rows with stable tool call ids', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/chat/models') return { models: [] }
      if (path === '/api/chat/history') return historyWithToolRows()
      return {}
    })

    const { result } = renderHook(() => useChatState(null), { wrapper })

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
    })

    expect(result.current.messages[1]).toEqual(expect.objectContaining({
      id: 'tool-row-1',
      role: 'tool',
      text: '3 matches',
      toolName: 'rg',
      toolCallId: 'call-rg-1',
    }))
  })
})
