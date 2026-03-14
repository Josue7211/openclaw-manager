import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, API_BASE, serviceForPath, serviceErrorLabel } from '../api'

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
  text?: () => Promise<string>
  headers?: Headers
}) {
  const headers = response.headers ?? new Headers({ 'content-type': 'application/json' })
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (() => Promise.resolve({})),
    text: response.text ?? (() => Promise.resolve('')),
    headers,
  })
}

describe('api', () => {
  it('successful JSON response returns parsed data', async () => {
    const payload = { id: 1, name: 'test' }
    mockFetch({ ok: true, json: () => Promise.resolve(payload) })

    const result = await api.get('/items')
    expect(result).toEqual(payload)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/items`,
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('non-200 response throws ApiError with status', async () => {
    mockFetch({ ok: false, status: 404, text: () => Promise.resolve('Not Found') })

    await expect(api.get('/missing')).rejects.toThrow(ApiError)
    await mockFetch({ ok: false, status: 404, text: () => Promise.resolve('Not Found') })

    try {
      await api.get('/missing')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
      expect((err as ApiError).body).toBe('Not Found')
    }
  })

  it('network error wraps in ApiError with service context', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )

    await expect(api.get('/fail')).rejects.toThrow(ApiError)

    try {
      await api.get('/api/messages/list')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(0)
      expect((err as ApiError).service).toBe('BlueBubbles')
      expect((err as ApiError).serviceLabel).toBe('BlueBubbles unreachable')
    }
  })

  it('POST sends JSON body', async () => {
    const body = { text: 'hello' }
    mockFetch({ ok: true, json: () => Promise.resolve({ ok: true }) })

    await api.post('/items', body)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/items`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      }),
    )
  })

  it('returns undefined for non-JSON responses', async () => {
    mockFetch({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
    })

    const result = await api.get('/health')
    expect(result).toBeUndefined()
  })

  it('ApiError includes service context from path', async () => {
    mockFetch({ ok: false, status: 502, text: () => Promise.resolve('Bad Gateway') })

    try {
      await api.get('/api/chat/history')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).service).toBe('OpenClaw')
      expect((err as ApiError).serviceLabel).toBe('OpenClaw unreachable')
    }
  })
})

describe('serviceForPath', () => {
  it('maps message routes to BlueBubbles', () => {
    expect(serviceForPath('/api/messages')).toBe('BlueBubbles')
    expect(serviceForPath('/api/messages/chat/123')).toBe('BlueBubbles')
  })

  it('maps chat routes to OpenClaw', () => {
    expect(serviceForPath('/api/chat')).toBe('OpenClaw')
    expect(serviceForPath('/api/chat/history')).toBe('OpenClaw')
  })

  it('maps data routes to Supabase', () => {
    expect(serviceForPath('/api/todos')).toBe('Supabase')
    expect(serviceForPath('/api/missions')).toBe('Supabase')
    expect(serviceForPath('/api/calendar')).toBe('Supabase')
    expect(serviceForPath('/api/settings')).toBe('Supabase')
  })

  it('falls back to Backend for unknown routes', () => {
    expect(serviceForPath('/api/cache')).toBe('Backend')
    expect(serviceForPath('/api/health')).toBe('Backend')
  })
})

describe('serviceErrorLabel', () => {
  it('returns human-readable labels', () => {
    expect(serviceErrorLabel('BlueBubbles')).toBe('BlueBubbles unreachable')
    expect(serviceErrorLabel('OpenClaw')).toBe('OpenClaw unreachable')
    expect(serviceErrorLabel('Supabase')).toBe('Database unavailable')
    expect(serviceErrorLabel('Backend')).toBe('Service unavailable')
  })
})
