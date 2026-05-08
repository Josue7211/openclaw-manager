export interface RemoteViewerStatus {
  configured: boolean
  reachable: boolean
  available?: boolean
  active?: number
  max?: number
  host?: string
  mode?: 'moonlight' | string
  moonlightUrl?: string
  sunshineUrl?: string
  target?: {
    raw?: string | null
    host: string
    port: number
    address: string
    configured: boolean
    repairHost?: string
    vncService?: string
    tunnelService?: string
  }
  reason?: string | null
  message: string
  guidance?: {
    summary?: string
    steps?: string[]
    services?: Record<string, string>
    repairHost?: string
  }
}

export interface RemoteViewerLaunchResult {
  ok: boolean
  moonlightUrl: string
}

export type RemoteViewerRepairTarget = 'tunnel' | 'vnc' | 'all'

export interface RemoteViewerRepairResult {
  ok: boolean
  target: RemoteViewerRepairTarget
  steps: Array<{
    target: 'tunnel' | 'vnc'
    host?: string
    service?: string
    ok: boolean
    error?: string
    result?: {
      program: string
      status: number
      stdout: string
    }
  }>
}

const DEFAULT_LOCAL_API_BASE = 'http://127.0.0.1:5000'

function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export function buildRemoteViewerWsUrl(apiBase: string, apiKey?: string): string {
  const base = (isTauriDesktop() ? DEFAULT_LOCAL_API_BASE : apiBase).replace(/^http/i, 'ws').replace(/\/+$/, '')
  const query = apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : ''
  return `${base}/api/vnc/ws${query}`
}
