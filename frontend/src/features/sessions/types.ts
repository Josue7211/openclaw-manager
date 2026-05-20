export type {
  ClaudeSession,
  GatewaySessionsResponse,
} from '@/chat/t3-adapters/gatewaySessionTypes'

export type SessionStatus = 'running' | 'completed' | 'failed' | 'unknown'

export interface SessionListResponse {
  sessions: import('@/chat/t3-adapters/gatewaySessionTypes').ClaudeSession[]
  available?: boolean
  error?: string
}

export interface CreateSessionPayload {
  task: string
  model?: string
  workingDir?: string
  label?: string
}

export type GatewayConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'not_configured'

export interface GatewayStatusResponse {
  connected: boolean
  status: GatewayConnectionStatus
}

export interface SessionHistoryMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string | null
  toolName?: string
}

export interface SessionHistoryResponse {
  messages: SessionHistoryMessage[]
  hasMore?: boolean
  total?: number
}

export const GATEWAY_STATUS_COLORS: Record<GatewayConnectionStatus, string> = {
  connected: 'var(--green-400)',
  disconnected: 'var(--red-500)',
  reconnecting: 'var(--amber)',
  not_configured: 'var(--text-muted)',
}

export const GATEWAY_STATUS_LABELS: Record<GatewayConnectionStatus, string> = {
  connected: 'Gateway connected',
  disconnected: 'Gateway disconnected',
  reconnecting: 'Gateway reconnecting',
  not_configured: 'Gateway not configured',
}

export const STATUS_COLORS: Record<string, string> = {
  running: 'var(--green-400)',
  completed: 'var(--blue)',
  failed: 'var(--red-500)',
  unknown: 'var(--text-muted)',
}

export const STATUS_LABELS: Record<string, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  unknown: 'Unknown',
}
