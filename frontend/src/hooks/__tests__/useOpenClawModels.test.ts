import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { useOpenClawModels } from '../useOpenClawModels'

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

describe('useOpenClawModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns model list on successful fetch', async () => {
    const { api } = await import('@/lib/api')
    const mockModels = {
      models: [
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
        { id: 'claude-3', name: 'Claude 3', provider: 'anthropic' },
      ],
    }
    vi.mocked(api.get).mockResolvedValue(mockModels)

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useOpenClawModels(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.models).toEqual(mockModels)
    expect(result.current.error).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/api/openclaw/models')
  })

  it('returns empty models array when provider has none', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockResolvedValue({ models: [] })

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useOpenClawModels(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.models?.models).toEqual([])
  })

  it('starts in loading state', async () => {
    const { api } = await import('@/lib/api')
    // Never resolve to keep loading
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useOpenClawModels(), { wrapper })

    expect(result.current.loading).toBe(true)
    expect(result.current.models).toBeUndefined()
  })

  it('returns error on fetch failure', async () => {
    const { api } = await import('@/lib/api')
    vi.mocked(api.get).mockRejectedValue(new Error('Connection refused'))

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useOpenClawModels(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.models).toBeUndefined()
  })

  it('handles LiteLLM data key format', async () => {
    const { api } = await import('@/lib/api')
    const litellmResponse = {
      data: [{ id: 'gpt-4', name: 'GPT-4' }],
    }
    vi.mocked(api.get).mockResolvedValue(litellmResponse)

    const { wrapper } = createWrapper()
    const { result } = renderHook(() => useOpenClawModels(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.models?.data).toEqual([{ id: 'gpt-4', name: 'GPT-4' }])
  })
})
