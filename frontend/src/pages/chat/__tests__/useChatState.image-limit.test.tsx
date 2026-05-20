import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatState } from '../useChatState'
import { CHAT_IMAGE_LIMIT } from '../constants'

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(async () => ({ models: [] })),
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
  useChatSocket: () => ({ connected: false, usingFallback: false }),
}))

class FileReaderMock {
  onload: ((event: { target: { result: string } }) => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(file: File) {
    this.onload?.({ target: { result: `data:${file.type};base64,${file.name}` } })
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useChatState image limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('FileReader', FileReaderMock)
    sessionStorage.clear()
    localStorage.clear()
  })

  it('caps file attachments and shows a clear limit message', async () => {
    const { result } = renderHook(() => useChatState(null, { blank: true }), { wrapper })
    const files = Array.from({ length: CHAT_IMAGE_LIMIT + 2 }, (_, index) => (
      new File(['png'], `shot-${index}.png`, { type: 'image/png' })
    ))

    act(() => {
      result.current.handleFileChange({
        target: { files, value: '' },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await waitFor(() => {
      expect(result.current.images).toHaveLength(CHAT_IMAGE_LIMIT)
    })
    expect(result.current.systemMsg).toBe(`You can attach up to ${CHAT_IMAGE_LIMIT} images at once.`)
  })
})
