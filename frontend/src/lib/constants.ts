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
