import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { ModelsResponse } from '@/pages/openclaw/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/lib/api'
import { useOpenClawModels } from '../useOpenClawModels'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOpenClawModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns models data on successful fetch', async () => {
    const mockData: ModelsResponse = {
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', max_tokens: 200000 },
        { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
      ],
    }
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockData)

    const { result } = renderHook(() => useOpenClawModels(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.models).toEqual(mockData)
    expect(result.current.error).toBeNull()
    expect(api.get).toHaveBeenCalledWith('/api/openclaw/models')
  })

  it('starts in loading state', () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useOpenClawModels(), {
      wrapper: createWrapper(),
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.models).toBeUndefined()
  })

  it('returns error on fetch failure', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useOpenClawModels(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.models).toBeUndefined()
  })

  it('preserves extra fields from gateway response', async () => {
    const mockData: ModelsResponse = {
      models: [{ id: 'test-model', provider: 'test' }],
      extra_field: 'preserved-value',
    }
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockData)

    const { result } = renderHook(() => useOpenClawModels(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    // The [key: string]: unknown index signature allows extra fields
    expect((result.current.models as Record<string, unknown>)?.extra_field).toBe('preserved-value')
  })

  it('handles LiteLLM data key response format', async () => {
    const mockData: ModelsResponse = {
      data: [
        { id: 'litellm-model', name: 'LiteLLM Model', provider: 'litellm' },
      ],
    }
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockData)

    const { result } = renderHook(() => useOpenClawModels(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Hook returns raw response; tab extracts models?.models ?? models?.data
    expect(result.current.models?.data).toHaveLength(1)
    expect(result.current.models?.data?.[0].id).toBe('litellm-model')
    expect(result.current.models?.models).toBeUndefined()
  })
})
