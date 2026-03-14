import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorageState } from '../useLocalStorageState'

beforeEach(() => {
  localStorage.clear()
})

describe('useLocalStorageState', () => {
  it('initializes from localStorage when value exists', () => {
    localStorage.setItem('test-key', JSON.stringify('stored-value'))
    const { result } = renderHook(() => useLocalStorageState('test-key', 'default'))
    expect(result.current[0]).toBe('stored-value')
  })

  it('falls back to default when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorageState('missing-key', 42))
    expect(result.current[0]).toBe(42)
  })

  it('falls back to default when localStorage has invalid JSON', () => {
    localStorage.setItem('bad-json', '{not valid json!!!')
    const { result } = renderHook(() => useLocalStorageState('bad-json', 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })

  it('updates localStorage when setter is called', () => {
    const { result } = renderHook(() => useLocalStorageState('persist-key', 'initial'))
    act(() => {
      result.current[1]('updated')
    })
    expect(localStorage.getItem('persist-key')).toBe(JSON.stringify('updated'))
  })

  it('returns updated value after setter call', () => {
    const { result } = renderHook(() => useLocalStorageState('state-key', 0))
    act(() => {
      result.current[1](99)
    })
    expect(result.current[0]).toBe(99)
  })
})
