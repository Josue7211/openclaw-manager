import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useApiError } from '../useApiError'
import { ApiError } from '@/lib/api'

// Mock reportError so we can verify it's called when options.report is true
vi.mock('@/lib/error-reporter', () => ({
  reportError: vi.fn(),
}))

import { reportError } from '@/lib/error-reporter'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useApiError', () => {
  it('returns null when error is null', () => {
    const { result } = renderHook(() => useApiError(null))
    expect(result.current).toBeNull()
  })

  it('returns null when error is undefined', () => {
    const { result } = renderHook(() => useApiError(undefined))
    expect(result.current).toBeNull()
  })

  it('returns serviceLabel for network-level ApiError (status 0)', () => {
    const err = new ApiError(0, 'network failure', '/api/messages/list')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('BlueBubbles unreachable')
  })

  it('returns serviceLabel for Supabase network error', () => {
    const err = new ApiError(0, 'fetch failed', '/api/todos')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('Database unavailable')
  })

  it('returns serviceLabel for OpenClaw network error', () => {
    const err = new ApiError(0, 'timeout', '/api/chat/history')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('OpenClaw unreachable')
  })

  it('returns serviceLabel for Backend network error', () => {
    const err = new ApiError(0, 'network', '/api/health')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('Service unavailable')
  })

  it('returns "API {status}" with service context for HTTP errors', () => {
    const err = new ApiError(502, 'Bad Gateway', '/api/chat/history')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('API 502 — OpenClaw unreachable')
  })

  it('returns "API {status}" for 404 errors', () => {
    const err = new ApiError(404, 'Not Found', '/api/todos')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('API 404 — Database unavailable')
  })

  it('returns "API {status}" for 500 errors with Backend fallback', () => {
    const err = new ApiError(500, 'Internal Server Error')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('API 500 — Service unavailable')
  })

  it('returns error.message for non-ApiError with meaningful message', () => {
    const err = new Error('Failed to parse response')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('Failed to parse response')
  })

  it('returns default fallback for non-ApiError with empty message', () => {
    const err = new Error('Error')
    const { result } = renderHook(() => useApiError(err))
    expect(result.current).toBe('Something went wrong')
  })

  it('returns custom fallback when provided', () => {
    const err = new Error('Error')
    const { result } = renderHook(() => useApiError(err, { fallback: 'Custom message' }))
    expect(result.current).toBe('Custom message')
  })

  it('does not call reportError by default', () => {
    const err = new ApiError(500, 'fail', '/api/todos')
    renderHook(() => useApiError(err))
    expect(reportError).not.toHaveBeenCalled()
  })

  it('calls reportError when options.report is true', () => {
    const err = new ApiError(500, 'fail', '/api/todos')
    renderHook(() => useApiError(err, { report: true }))
    expect(reportError).toHaveBeenCalledWith(err, 'useApiError')
  })

  it('does not call reportError when error is null even with report=true', () => {
    renderHook(() => useApiError(null, { report: true }))
    expect(reportError).not.toHaveBeenCalled()
  })

  it('updates when error changes from null to an error', () => {
    let error: Error | null = null
    const { result, rerender } = renderHook(() => useApiError(error))

    expect(result.current).toBeNull()

    error = new ApiError(0, 'network', '/api/messages/list')
    rerender()

    expect(result.current).toBe('BlueBubbles unreachable')
  })

  it('updates when error clears back to null', () => {
    let error: Error | null = new Error('Something broke')
    const { result, rerender } = renderHook(() => useApiError(error))

    expect(result.current).toBe('Something broke')

    error = null
    rerender()

    expect(result.current).toBeNull()
  })
})
