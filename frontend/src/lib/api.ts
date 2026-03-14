import { queueMutation } from './offline-queue'
import { reportError } from './error-reporter'

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000'

export type ServiceName = 'BlueBubbles' | 'OpenClaw' | 'Supabase' | 'Backend'

/** Determine which upstream service a path routes to */
export function serviceForPath(path: string): ServiceName {
  if (path.startsWith('/api/messages')) return 'BlueBubbles'
  if (path.startsWith('/api/chat'))     return 'OpenClaw'
  // Supabase-backed routes
  if (/^\/(api\/)?(todos|missions|calendar|settings|prefs|daily-review|ideas|knowledge|capture|emails|email)/.test(path)) return 'Supabase'
  return 'Backend'
}

/** Human-readable error label per service */
export function serviceErrorLabel(service: ServiceName): string {
  switch (service) {
    case 'BlueBubbles': return 'BlueBubbles unreachable'
    case 'OpenClaw':    return 'OpenClaw unreachable'
    case 'Supabase':    return 'Database unavailable'
    default:            return 'Service unavailable'
  }
}

export class ApiError extends Error {
  /** Which upstream service this request targeted */
  public service: ServiceName
  /** Short user-facing label like "BlueBubbles unreachable" */
  public serviceLabel: string

  constructor(public status: number, public body: unknown, path?: string) {
    const svc = serviceForPath(path ?? '')
    const label = status === 0 ? serviceErrorLabel(svc) : `API ${status}`
    super(label)
    this.name = 'ApiError'
    this.service = svc
    this.serviceLabel = serviceErrorLabel(svc)
  }
}

// Module-level closure for the API key -- never exposed on `window`
let _apiKey: string | undefined

/** Set the API key used for X-API-Key headers. Call once at startup. */
export function setApiKey(key: string) {
  _apiKey = key
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (_apiKey) {
    headers['X-API-Key'] = _apiKey
  }
  const opts: RequestInit = {
    method,
    headers,
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...opts, signal: controller.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const apiErr = new ApiError(res.status, text, path)
      reportError(apiErr, 'api-request')
      throw apiErr
    }
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return res.json()
    // Non-JSON response: safe for void callers, but throw if body has content
    // (indicates a server misconfiguration or unexpected response format)
    const text = await res.text()
    if (text.length > 0) {
      throw new Error(`Expected JSON response from ${method} ${path} but got content-type: ${contentType}`)
    }
    return undefined as T
  } catch (err) {
    // Re-throw ApiError as-is (already reported at the throw site above)
    if (err instanceof ApiError) throw err

    // Network failure on a mutation → queue for offline replay
    const isMutation = method === 'POST' || method === 'PATCH' || method === 'DELETE'
    const isNetworkError =
      (err instanceof TypeError && /fetch|network/i.test(err.message)) ||
      (err instanceof DOMException && err.name === 'AbortError')
    if (isMutation && isNetworkError) {
      queueMutation(path, method as 'POST' | 'PATCH' | 'DELETE', body)
      // Return undefined so optimistic UI stays in place
      return undefined as T
    }

    const svc = serviceForPath(path)
    const apiErr = new ApiError(0, err instanceof Error ? err.message : 'Network error', path)
    if (err instanceof DOMException && err.name === 'AbortError') {
      apiErr.message = `${serviceErrorLabel(svc)} (timeout)`
    }
    reportError(apiErr, 'api-request')
    throw apiErr
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
