export type SessionStatus = 'running' | 'paused' | 'completed' | 'failed' | 'unknown'

export interface ClaudeSession {
  id: string
  task: string
  status: SessionStatus
  model: string | null
  workingDir: string | null
  startedAt: string | null
  duration: number | null // seconds
  kind: string
  agentId?: string
  [key: string]: unknown // forward-compatible per Phase 12 pattern
}

export interface SessionListResponse {
  sessions: ClaudeSession[]
  available?: boolean // false when OpenClaw is unreachable
  error?: string
}

export interface CreateSessionPayload {
  task: string
  model?: string
  workingDir?: string
}

// Gateway connection status types
export type GatewayConnectionStatus = 'connected' | 'disconnected' | 'not_configured'

export interface GatewayStatusResponse {
  connected: boolean
  status: GatewayConnectionStatus
}

export interface GatewaySessionsResponse {
  sessions: ClaudeSession[]
}

// Gateway status color mapping
export const GATEWAY_STATUS_COLORS: Record<GatewayConnectionStatus, string> = {
  connected: 'var(--green-400)',
  disconnected: 'var(--red-500)',
  not_configured: 'var(--text-muted)',
}

export const GATEWAY_STATUS_LABELS: Record<GatewayConnectionStatus, string> = {
  connected: 'Gateway connected',
  disconnected: 'Gateway disconnected',
  not_configured: 'Gateway not configured',
}

// Status color mapping using CSS variables (not hardcoded colors)
export const STATUS_COLORS: Record<string, string> = {
  running: 'var(--green-400)',
  paused: 'var(--amber)',
  completed: 'var(--blue)',
  failed: 'var(--red-500)',
  unknown: 'var(--text-muted)',
}

// Status display labels
export const STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  unknown: 'Unknown',
}
