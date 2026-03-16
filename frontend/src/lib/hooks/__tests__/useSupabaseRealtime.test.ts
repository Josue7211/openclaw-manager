import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ── Supabase mock ──────────────────────────────────────────
// vi.mock is hoisted — use vi.hoisted() so the references are available.
const {
  channelMock,
  onMock,
  subscribeMock,
  removeChannelMock,
  getSubscribeCallback,
} = vi.hoisted(() => {
  let _subscribeCallback: (() => void) | null = null
  const subscribeMock = vi.fn().mockReturnThis()
  const onMock = vi.fn().mockImplementation(
    (_event: string, _filter: unknown, cb: () => void) => {
      _subscribeCallback = cb
      return { subscribe: subscribeMock }
    },
  )
  return {
    channelMock: vi.fn().mockReturnValue({ on: onMock, subscribe: subscribeMock }),
    onMock,
    subscribeMock,
    removeChannelMock: vi.fn(),
    getSubscribeCallback: () => _subscribeCallback,
  }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: channelMock,
    removeChannel: removeChannelMock,
  },
}))

// ── React Query mock ───────────────────────────────────────
const { invalidateQueriesMock } = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

import { useSupabaseRealtime } from '../useSupabaseRealtime'

describe('useSupabaseRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a channel with the given name and table', () => {
    renderHook(() =>
      useSupabaseRealtime('test-channel', 'todos', {
        queryKey: ['todos'],
      }),
    )

    expect(channelMock).toHaveBeenCalledWith('test-channel')
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'todos' },
      expect.any(Function),
    )
    expect(subscribeMock).toHaveBeenCalled()
  })

  it('invalidates the query key when an event fires', () => {
    renderHook(() =>
      useSupabaseRealtime('agents-rt', 'agents', {
        queryKey: ['agents'],
      }),
    )

    const cb = getSubscribeCallback()
    expect(cb).toBeTruthy()
    cb!()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['agents'] })
  })

  it('calls onEvent callback when an event fires', () => {
    const onEvent = vi.fn()
    renderHook(() =>
      useSupabaseRealtime('ideas-rt', 'ideas', { onEvent }),
    )

    getSubscribeCallback()!()
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('calls both queryKey invalidation and onEvent when both provided', () => {
    const onEvent = vi.fn()
    renderHook(() =>
      useSupabaseRealtime('combo-rt', 'missions', {
        queryKey: ['missions'],
        onEvent,
      }),
    )

    getSubscribeCallback()!()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['missions'] })
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(() =>
      useSupabaseRealtime('cleanup-rt', 'agents', {
        queryKey: ['agents'],
      }),
    )

    unmount()
    expect(removeChannelMock).toHaveBeenCalled()
  })

  it('does not invalidate queries when only onEvent is provided', () => {
    const onEvent = vi.fn()
    renderHook(() =>
      useSupabaseRealtime('only-cb', 'cache', { onEvent }),
    )

    getSubscribeCallback()!()
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('does not call onEvent when only queryKey is provided', () => {
    renderHook(() =>
      useSupabaseRealtime('only-qk', 'todos', {
        queryKey: ['todos'],
      }),
    )

    getSubscribeCallback()!()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['todos'] })
  })
})
