// Shared constants — importable from both server and client components

export const AGENT_STATUS = {
  ACTIVE: 'active',
  IDLE: 'idle',
  AWAITING_DEPLOY: 'awaiting_deploy',
} as const

export const MISSION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DONE: 'done',
  FAILED: 'failed',
  AWAITING_REVIEW: 'awaiting_review',
} as const

export const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type AgentStatusType = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS]
export type MissionStatusType = (typeof MISSION_STATUS)[keyof typeof MISSION_STATUS]
export type ReviewStatusType = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS]
