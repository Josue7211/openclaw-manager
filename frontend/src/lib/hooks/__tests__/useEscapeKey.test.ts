import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEscapeKey } from '../useEscapeKey'

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useEscapeKey', () => {
  it('calls callback when Escape is pressed', () => {
    const cb = vi.fn()
    renderHook(() => useEscapeKey(cb))
    pressKey('Escape')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('does not call callback when other keys are pressed', () => {
    const cb = vi.fn()
    renderHook(() => useEscapeKey(cb))
    pressKey('Enter')
    pressKey('a')
    pressKey('Tab')
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not call callback when enabled=false', () => {
    const cb = vi.fn()
    renderHook(() => useEscapeKey(cb, false))
    pressKey('Escape')
    expect(cb).not.toHaveBeenCalled()
  })

  it('cleans up listener on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useEscapeKey(cb))
    unmount()
    pressKey('Escape')
    expect(cb).not.toHaveBeenCalled()
  })
})
