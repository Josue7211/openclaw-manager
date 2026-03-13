export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000'

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`)
    this.name = 'ApiError'
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ApiError(res.status, text)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return undefined as T
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
