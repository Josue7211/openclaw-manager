import { getConfiguredBackendBase } from './api'

export interface SetupServiceState {
  configured: boolean
  reachable: boolean
  status?: string
  auth_configured?: boolean
  auth_valid?: boolean
  auth_source?: string
  checked_path?: string | null
  message?: string | null
}

export interface SetupStatus {
  ok: boolean
  backend_public_base_url: string
  pairing_required: boolean
  capabilities: {
    google_oauth: boolean
    github_oauth: boolean
    hermes?: boolean
    harness?: boolean
    openclaw?: boolean
    agentsecrets: boolean
    memd: boolean
  }
  services: {
    supabase: SetupServiceState
    hermes?: SetupServiceState
    harness?: SetupServiceState
    openclaw?: SetupServiceState
    agentsecrets: SetupServiceState
    memd: SetupServiceState
  }
  missing: string[]
}

export interface PairResponse {
  ok: boolean
  paired: boolean
  device_name?: string | null
  device_api_key?: string | null
  next: string[]
}

const DEVICE_ID_STORAGE_KEY = 'clawctrl-device-id'

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim()
    if (existing) return existing
    const generated = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}`
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated)
    return generated
  } catch {
    return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}`
  }
}

export function normalizeBackendUrl(baseUrl?: string): string {
  const fallback = getConfiguredBackendBase()
  const value = (baseUrl || fallback).trim().replace(/\/+$/, '')
  return value || fallback
}

async function fetchSetupJson<T>(path: string, init?: RequestInit, baseUrl?: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${normalizeBackendUrl(baseUrl)}${path}`, {
      ...init,
      signal: controller.signal,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(typeof body?.error === 'string' ? body.error : `${path} failed: ${res.status}`)
    }
    return body as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Backend request timed out')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function getSetupStatus(baseUrl?: string): Promise<SetupStatus> {
  return fetchSetupJson<SetupStatus>('/api/setup/status', undefined, baseUrl)
}

export async function pairWithBackend(token: string, deviceName?: string, baseUrl?: string): Promise<PairResponse> {
  return fetchSetupJson<PairResponse>('/api/setup/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, deviceName, deviceId: getOrCreateDeviceId() }),
  }, baseUrl)
}
