export interface ClaudeSession {
  key: string            // session identifier (protocol uses 'key' not 'id')
  label: string          // display name (may be empty — show "Untitled" as fallback)
  agentKey: string       // agent handling this session
  messageCount: number   // total messages
  lastActivity: string   // ISO-8601 timestamp
  [key: string]: unknown // forward-compatible
}

export interface GatewaySessionsResponse {
  ok: boolean
  sessions: ClaudeSession[]
}

// Gateway connection status types
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
}

// Gateway status color mapping
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
