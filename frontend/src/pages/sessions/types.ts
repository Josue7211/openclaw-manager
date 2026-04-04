// === New protocol-accurate types (Phase 91) ===

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

// === Legacy types (kept until SessionCard rewrite in Phase 91-02) ===

export type SessionStatus = 'running' | 'completed' | 'failed' | 'unknown'

export interface SessionListResponse {
  sessions: ClaudeSession[]
  available?: boolean
  error?: string
}

export interface CreateSessionPayload {
  task: string
  model?: string
  workingDir?: string
  label?: string
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
  hasMore?: boolean
  total?: number
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

// Status color mapping (legacy — used by SessionCard until rewrite)
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
