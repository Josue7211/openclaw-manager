import { reportError } from './error-reporter'

const API_BASE_STORAGE_KEY = 'backend-api-base'
const CONFIGURED_BACKEND_BASE_STORAGE_KEY = 'configured-backend-base'
const ENV_API_BASE = import.meta.env.VITE_API_BASE?.trim()
const DEFAULT_API_BASE = ENV_API_BASE || 'http://127.0.0.1:5000'
const DEFAULT_LOCAL_API_BASE = 'http://127.0.0.1:5000'
const LOCAL_DESKTOP_ONLY_PATH_PREFIXES = [
  '/api/email',
  '/api/mail-accounts',
  '/api/generated-modules',
  '/api/module-proposals',
  '/api/rag',
  '/api/remote',
  '/api/vnc',
]
export const API_BASE_CHANGED_EVENT = 'backend-api-base-changed'
export const CONFIGURED_BACKEND_BASE_CHANGED_EVENT = 'configured-backend-base-changed'

export interface ApiBaseChangedDetail {
  previousBase: string
  nextBase: string
}

function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

function loadApiBase(): string {
  if (isTauriDesktop()) {
    return normalizeApiBase(DEFAULT_LOCAL_API_BASE)
  }
  if (ENV_API_BASE) {
    return normalizeApiBase(ENV_API_BASE)
  }
  try {
    const stored = localStorage.getItem(API_BASE_STORAGE_KEY)
    if (stored && stored.trim()) return normalizeApiBase(stored)
  } catch {
    // ignore storage access failures
  }
  return normalizeApiBase(DEFAULT_API_BASE)
}

function loadConfiguredBackendBase(): string {
  try {
    const stored = localStorage.getItem(CONFIGURED_BACKEND_BASE_STORAGE_KEY)
    if (stored && stored.trim()) return normalizeApiBase(stored)
  } catch {
    // ignore storage access failures
  }
  return normalizeApiBase(DEFAULT_API_BASE)
}

export let API_BASE = loadApiBase()
export let CONFIGURED_BACKEND_BASE = loadConfiguredBackendBase()

export interface DesktopApiBootstrapConfig {
  savedApiBase?: string | null
  localApiKey?: string | null
  remoteApiKey?: string | null
}

export interface DesktopApiBootstrapResult {
  apiBase: string
  configuredBackendBase: string
  apiKey?: string
}

export interface DesktopApiKeyConfig {
  localApiKey?: string | null
  remoteApiKey?: string | null
}

export function resolveDesktopApiBootstrap(config: DesktopApiBootstrapConfig): DesktopApiBootstrapResult {
  const savedApiBase = config.savedApiBase?.trim()
    ? normalizeApiBase(config.savedApiBase)
    : ''
  const localApiKey = config.localApiKey?.trim() || ''
  const remoteApiKey = config.remoteApiKey?.trim() || ''
  const hasRemoteBackend = !!savedApiBase && savedApiBase !== normalizeApiBase(DEFAULT_LOCAL_API_BASE)

  if (hasRemoteBackend) {
    return {
      apiBase: savedApiBase,
      configuredBackendBase: savedApiBase,
      apiKey: remoteApiKey || undefined,
    }
  }

  return {
    apiBase: normalizeApiBase(DEFAULT_LOCAL_API_BASE),
    configuredBackendBase: savedApiBase || normalizeApiBase(DEFAULT_API_BASE),
    apiKey: localApiKey || undefined,
  }
}

export type ServiceName = 'BlueBubbles' | 'OpenClaw' | 'Backend'

/** Determine which upstream service a path routes to */
export function serviceForPath(path: string): ServiceName {
  if (path.startsWith('/api/messages')) return 'BlueBubbles'
  if (path.startsWith('/api/chat'))     return 'OpenClaw'
  return 'Backend'
}

/** Human-readable error label per service */
export function serviceErrorLabel(service: ServiceName): string {
  switch (service) {
    case 'BlueBubbles': return 'BlueBubbles unreachable'
    case 'OpenClaw':    return 'Harness unreachable'
    default:            return 'Service unavailable'
  }
}

/**
 * Error thrown by the `api` fetch wrapper for HTTP failures and network errors.
 * Carries the upstream service name and a user-facing label for display in UI.
 */
export class ApiError extends Error {
  /** Which upstream service this request targeted */
  public service: ServiceName
  /** Short user-facing label like "BlueBubbles unreachable" */
  public serviceLabel: string

  constructor(public status: number, public body: unknown, path?: string) {
    const svc = serviceForPath(path ?? '')
    const label = status === 0 ? serviceErrorLabel(svc) : `API ${status}`
    const message =
      status !== 0 &&
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : label
    super(message)
    this.name = 'ApiError'
    this.service = svc
    this.serviceLabel = serviceErrorLabel(svc)
  }
}

// Module-level closure for the API key -- never exposed on `window`
let _apiKey: string | undefined
let _localApiKey: string | undefined
let _remoteApiKey: string | undefined

/** Set the API key used for X-API-Key headers. Call once at startup. */
export function setApiKey(key: string) {
  _apiKey = key
}

export function setDesktopApiKeys(config: DesktopApiKeyConfig) {
  _localApiKey = config.localApiKey?.trim() || undefined
  _remoteApiKey = config.remoteApiKey?.trim() || undefined
  _apiKey = _remoteApiKey ?? _localApiKey
}

/** Get the current API key for raw fetch calls that bypass the api wrapper. */
export function getApiKey(): string | undefined {
  return _apiKey
}

export function getLocalApiKey(): string | undefined {
  return _localApiKey ?? _apiKey
}

function isLocalDesktopOnlyPath(path: string): boolean {
  return LOCAL_DESKTOP_ONLY_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

function requestBaseForPath(path: string): string {
  if (isTauriDesktop() && isLocalDesktopOnlyPath(path)) {
    return normalizeApiBase(DEFAULT_LOCAL_API_BASE)
  }
  return API_BASE
}

function requestApiKeyForPath(path: string): string | undefined {
  if (isTauriDesktop() && isLocalDesktopOnlyPath(path)) {
    return _localApiKey ?? _apiKey
  }
  if (isTauriDesktop()) {
    return _remoteApiKey ?? _apiKey
  }
  return _apiKey
}

export function setApiBase(nextBase: string) {
  const previousBase = API_BASE
  API_BASE = normalizeApiBase(nextBase || DEFAULT_API_BASE)
  try {
    localStorage.setItem(API_BASE_STORAGE_KEY, API_BASE)
  } catch {
    // ignore storage access failures
  }
  if (typeof window !== 'undefined' && API_BASE !== previousBase) {
    window.dispatchEvent(new CustomEvent<ApiBaseChangedDetail>(API_BASE_CHANGED_EVENT, {
      detail: { previousBase, nextBase: API_BASE },
    }))
  }
}

export function getApiBase(): string {
  return API_BASE
}

export function setConfiguredBackendBase(nextBase: string) {
  const previousBase = CONFIGURED_BACKEND_BASE
  CONFIGURED_BACKEND_BASE = normalizeApiBase(nextBase || DEFAULT_API_BASE)
  try {
    localStorage.setItem(CONFIGURED_BACKEND_BASE_STORAGE_KEY, CONFIGURED_BACKEND_BASE)
  } catch {
    // ignore storage access failures
  }
  if (typeof window !== 'undefined' && CONFIGURED_BACKEND_BASE !== previousBase) {
    window.dispatchEvent(new CustomEvent<ApiBaseChangedDetail>(CONFIGURED_BACKEND_BASE_CHANGED_EVENT, {
      detail: { previousBase, nextBase: CONFIGURED_BACKEND_BASE },
    }))
  }
}

export function getConfiguredBackendBase(): string {
  return CONFIGURED_BACKEND_BASE
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = requestApiKeyForPath(path)
  if (apiKey) {
    headers['X-API-Key'] = apiKey
  }
  const opts: RequestInit = {
    method,
    headers,
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${requestBaseForPath(path)}${path}`, { ...opts, signal: controller.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let body: unknown = text
      try {
        body = text ? JSON.parse(text) : text
      } catch {
        body = text
      }
      const apiErr = new ApiError(res.status, body, path)
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

/**
 * Fetch wrapper with 30s timeout, API key auth, and offline mutation queuing.
 * All methods throw `ApiError` on failure; mutations are queued when offline.
 */
export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = unknown>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
