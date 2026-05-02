import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  getApiBase: vi.fn(() => 'http://127.0.0.1:5000'),
}))

import { getSetupStatus, normalizeBackendUrl, pairWithBackend } from '../setup'
import { getApiBase } from '../api'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(response: {
  ok?: boolean
  status?: number
  json?: () => Promise<unknown>
}) {
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (() => Promise.resolve({ ok: true })),
  })
}

describe('normalizeBackendUrl', () => {
  it('trims whitespace and strips trailing slashes', () => {
    expect(normalizeBackendUrl('  http://example.test:3000///  ')).toBe('http://example.test:3000')
  })

  it('falls back to the current api base when empty', () => {
    vi.mocked(getApiBase).mockReturnValue('http://saved-backend:5000')
    expect(normalizeBackendUrl('   ')).toBe('http://saved-backend:5000')
  })
})

describe('getSetupStatus', () => {
  it('requests setup status from the normalized backend url', async () => {
    mockFetch({
      json: () => Promise.resolve({ ok: true, backend_public_base_url: 'http://example.test:3000' }),
    })

    await getSetupStatus('http://example.test:3000///')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://example.test:3000/api/setup/status',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('surfaces backend-provided error messages', async () => {
    mockFetch({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: 'Backend booting' }),
    })

    await expect(getSetupStatus('http://example.test:3000')).rejects.toThrow('Backend booting')
  })
})

describe('pairWithBackend', () => {
  it('posts the pairing token and device name to the normalized backend url', async () => {
    mockFetch({
      json: () => Promise.resolve({ ok: true, paired: true, next: [] }),
    })

    await pairWithBackend('token-123', 'ClawControl Desktop', 'http://pairing.test:4000///')
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const parsed = JSON.parse(init.body as string) as {
      token: string
      deviceName: string
      deviceId: string
    }

    expect(parsed).toEqual(
      expect.objectContaining({
        token: 'token-123',
        deviceName: 'ClawControl Desktop',
      }),
    )
    expect(parsed.deviceId).toEqual(expect.any(String))
    expect(parsed.deviceId.length).toBeGreaterThan(0)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://pairing.test:4000/api/setup/pair',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('maps aborted requests to a stable timeout error', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    )

    await expect(pairWithBackend('token-123', 'ClawControl Desktop')).rejects.toThrow('Backend request timed out')
  })
})
