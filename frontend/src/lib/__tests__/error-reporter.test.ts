import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reportError } from '../error-reporter'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reportError', () => {
  it('does nothing when error reporting is disabled (default)', () => {
    reportError(new Error('test'))
    expect(console.info).not.toHaveBeenCalled()
  })

  it('does nothing when error-reporting is explicitly "false"', () => {
    localStorage.setItem('error-reporting', 'false')
    reportError(new Error('test'))
    expect(console.info).not.toHaveBeenCalled()
  })

  it('logs report when error reporting is enabled', () => {
    localStorage.setItem('error-reporting', 'true')
    reportError(new Error('Something broke'))

    expect(console.info).toHaveBeenCalledTimes(1)
    const [tag, json] = (console.info as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(tag).toBe('[ErrorReport]')

    const report = JSON.parse(json)
    expect(report.message).toBe('Something broke')
    expect(report.version).toBe('0.1.0')
    expect(report.timestamp).toBeTypeOf('number')
  })

  it('includes error stack truncated to 500 chars', () => {
    localStorage.setItem('error-reporting', 'true')
    const err = new Error('test')
    // Create a long stack
    err.stack = 'Error: test\n' + 'x'.repeat(600)

    reportError(err)

    const report = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(report.stack.length).toBeLessThanOrEqual(500)
  })

  it('includes platform from navigator', () => {
    localStorage.setItem('error-reporting', 'true')
    reportError(new Error('test'))

    const report = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(report.platform).toBeDefined()
  })

  it('includes route from window.location.pathname', () => {
    localStorage.setItem('error-reporting', 'true')
    reportError(new Error('test'))

    const report = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(report.route).toBeDefined()
  })

  it('includes context when provided', () => {
    localStorage.setItem('error-reporting', 'true')
    reportError(new Error('fail'), 'loading dashboard')

    const report = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(report.context).toBe('loading dashboard')
  })

  it('omits context when not provided', () => {
    localStorage.setItem('error-reporting', 'true')
    reportError(new Error('fail'))

    const report = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(report.context).toBeUndefined()
  })

  it('handles error with no stack gracefully', () => {
    localStorage.setItem('error-reporting', 'true')
    const err = new Error('no stack')
    err.stack = undefined

    reportError(err)

    const report = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(report.message).toBe('no stack')
    expect(report.stack).toBeUndefined()
  })
})
