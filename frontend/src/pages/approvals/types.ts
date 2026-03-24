export interface ApprovalRequest {
  id: string
  sessionId: string
  agentId?: string
  tool: string
  args: Record<string, unknown>
  context: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface ApprovalsResponse {
  approvals: ApprovalRequest[]
}
