export interface ApprovalRequest {
  id: string
  source?: 'harness' | 'agentsecrets' | string
  sourceLabel?: string
  sessionId?: string
  agentId?: string
  risk?: 'low' | 'medium' | 'high' | string
  expiresAt?: string
  tool: string
  args: Record<string, unknown>
  context: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
  raw?: unknown
}

export interface ApprovalSourceStatus {
  source: string
  label: string
  configured: boolean
  ok: boolean
  count?: number
  error?: string
}

export interface ApprovalsResponse {
  approvals: ApprovalRequest[]
  sources?: ApprovalSourceStatus[]
}
