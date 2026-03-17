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

  it('maps data routes to Backend', () => {
    expect(serviceForPath('/api/todos')).toBe('Backend')
    expect(serviceForPath('/api/missions')).toBe('Backend')
    expect(serviceForPath('/api/calendar')).toBe('Backend')
    expect(serviceForPath('/api/settings')).toBe('Backend')
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
    expect(serviceErrorLabel('Backend')).toBe('Service unavailable')
  })
})

describe('ApiError', () => {
  it('sets name to ApiError', () => {
    const err = new ApiError(500, 'Internal error', '/api/todos')
    expect(err.name).toBe('ApiError')
  })

  it('is an instance of Error', () => {
    const err = new ApiError(400, 'Bad Request')
    expect(err).toBeInstanceOf(Error)
  })

  it('uses status 0 label when status is 0', () => {
    const err = new ApiError(0, 'network', '/api/messages/list')
    expect(err.message).toBe('BlueBubbles unreachable')
    expect(err.service).toBe('BlueBubbles')
  })

  it('uses API status label for non-zero status', () => {
    const err = new ApiError(403, 'Forbidden', '/api/agents')
    expect(err.message).toBe('API 403')
  })

  it('defaults to Backend service when no path given', () => {
    const err = new ApiError(500, 'error')
    expect(err.service).toBe('Backend')
    expect(err.serviceLabel).toBe('Service unavailable')
  })

  it('preserves status and body', () => {
    const body = { error: 'not found' }
    const err = new ApiError(404, body, '/api/missions')
    expect(err.status).toBe(404)
    expect(err.body).toEqual(body)
  })
})

describe('api edge cases', () => {
  it('PATCH sends correct method', async () => {
    mockFetch({ ok: true, json: () => Promise.resolve({ updated: true }) })
    await api.patch('/items/1', { text: 'updated' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/items/1`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ text: 'updated' }),
      }),
    )
  })

  it('PUT sends correct method with body', async () => {
    mockFetch({ ok: true, json: () => Promise.resolve({ saved: true }) })
    await api.put('/items/1', { name: 'new' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/items/1`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'new' }),
      }),
    )
  })

  it('DELETE sends correct method', async () => {
    mockFetch({ ok: true, json: () => Promise.resolve({}) })
    await api.del('/items/1')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/items/1`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws when non-JSON response has content', async () => {
    mockFetch({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve('<html>unexpected</html>'),
    })

    // The Error thrown inside request() gets caught and re-wrapped as an ApiError with status 0
    await expect(api.get('/bad-response')).rejects.toThrow(ApiError)
    try {
      await api.get('/bad-response')
    } catch (err) {
      expect((err as ApiError).status).toBe(0)
    }
  })

  it('handles res.text() failure on error response gracefully', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('read failed')),
      headers: new Headers({ 'content-type': 'application/json' }),
    })

    await expect(api.get('/error-path')).rejects.toThrow(ApiError)
    try {
      await api.get('/error-path')
    } catch (err) {
      expect((err as ApiError).body).toBe('')
    }
  })

  it('includes Content-Type header on all requests', async () => {
    mockFetch({ ok: true, json: () => Promise.resolve({}) })
    await api.get('/test')
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1].headers['Content-Type']).toBe('application/json')
  })

  it('sends API key header when set', async () => {
    const { setApiKey } = await import('../api')
    setApiKey('test-key-123')
    mockFetch({ ok: true, json: () => Promise.resolve({}) })
    await api.get('/test')
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(callArgs[1].headers['X-API-Key']).toBe('test-key-123')
    // Clean up
    setApiKey('')
  })
})

describe('serviceForPath edge cases', () => {
  it('maps data routes to Backend (all proxied through Axum)', () => {
    expect(serviceForPath('/api/todos')).toBe('Backend')
    expect(serviceForPath('/api/missions')).toBe('Backend')
    expect(serviceForPath('/api/prefs')).toBe('Backend')
    expect(serviceForPath('/api/daily-review')).toBe('Backend')
    expect(serviceForPath('/api/ideas')).toBe('Backend')
    expect(serviceForPath('/api/knowledge')).toBe('Backend')
    expect(serviceForPath('/api/capture')).toBe('Backend')
    expect(serviceForPath('/api/emails')).toBe('Backend')
    expect(serviceForPath('/api/email')).toBe('Backend')
    expect(serviceForPath('/api/agents')).toBe('Backend')
  })

  it('maps root path to Backend', () => {
    expect(serviceForPath('/')).toBe('Backend')
  })

  it('maps empty string to Backend', () => {
    expect(serviceForPath('')).toBe('Backend')
  })
})
