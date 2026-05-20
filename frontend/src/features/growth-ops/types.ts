export type GrowthPlatform = 'tiktok' | 'instagram' | 'youtube'
export type GrowthRecipeStatus = 'winning' | 'promising' | 'testing' | 'stale' | 'failed'
export type GrowthIdeaStatus = 'idea' | 'scripted' | 'needs-video' | 'ready-for-approval' | 'queued' | 'recorded' | 'packaged' | 'posted' | 'archived'
export type GrowthPostApprovalState = 'draft' | 'needs-video' | 'ready-for-approval' | 'approved' | 'queued' | 'posted' | 'blocked'
export type GrowthSignalSource = 'owned-analytics' | 'watchlist' | 'manual-link' | 'approved-provider'
export type GrowthSourceConfidence = 'low' | 'medium' | 'high'
export type GrowthConnectorStatusValue =
  | 'not_configured'
  | 'configured'
  | 'oauth_required'
  | 'permission_missing'
  | 'review_required'
  | 'ready'
  | 'error'
export type GrowthCalendarSlotState = 'idea' | 'scripted' | 'needs-video' | 'ready-for-approval' | 'queued'
export type GrowthRecipeRecommendation = 'double-down' | 'remix' | 'pause' | 'test'

export interface GrowthMetricSet {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  watchRetention?: number | null
  followerDelta?: number | null
  leadSignal?: number | null
}

export interface GrowthEvidenceRow {
  id: string
  source: GrowthSignalSource
  platform: GrowthPlatform
  summary: string
  score: number
  measuredAt?: string
  url?: string
}

export interface CreatorWatchlist {
  id: string
  platform: GrowthPlatform
  handle: string
  displayName: string
  niche: string
  rationale: string
  source: GrowthSignalSource
  lastCheckedAt?: string
}

export interface ViralVideo {
  id: string
  platform: GrowthPlatform
  creatorId?: string
  creatorHandle: string
  url: string
  hook: string
  topic: string
  format: string
  lengthSeconds: number
  metrics: GrowthMetricSet
  notes: string
  source: GrowthSignalSource
  sourceConfidence: GrowthSourceConfidence
  capturedAt: string
}

export interface ContentRecipe {
  id: string
  name: string
  hookFormula: string
  visualFormat: string
  proofType: string
  cta: string
  difficulty: 1 | 2 | 3 | 4 | 5
  expectedUpside: 1 | 2 | 3 | 4 | 5
  status: GrowthRecipeStatus
  topics: string[]
  baselineScore: number
  platformScores: Record<GrowthPlatform, number>
  recommendation: GrowthRecipeRecommendation
  recommendationReason: string
  recommendationEvidence: GrowthEvidenceRow[]
  topicFatigue: boolean
  lastReviewedAt?: string
}

export interface GrowthCalendarSlot {
  id: string
  date: string
  platform: GrowthPlatform
  state: GrowthCalendarSlotState
  ideaId?: string
  postPackageId?: string
  title: string
  batchRecording: boolean
  order: number
}

export interface GrowthAnalyticsImportRow {
  id: string
  raw: Record<string, string>
  platform: GrowthPlatform
  postPackageId?: string
  ideaId?: string
  recipeId?: string
  topic?: string
  horizon: '1h' | '24h' | '72h' | '7d'
  source: GrowthSignalSource
  confidence: GrowthSourceConfidence
  metrics: GrowthMetricSet
  measuredAt: string
  attributed: boolean
  quarantineReason?: string
}

export interface GrowthQuarantinedAnalyticsRow {
  id: string
  raw: Record<string, string>
  platform?: GrowthPlatform
  source: GrowthSignalSource
  confidence: GrowthSourceConfidence
  quarantineReason: string
  capturedAt: string
}

export interface ContentIdea {
  id: string
  recipeId: string
  title: string
  scriptOutline: string[]
  platformVariants: Record<GrowthPlatform, string>
  caption: string
  hashtags: string[]
  cta: string
  status: GrowthIdeaStatus
  makeToday: boolean
  plannedSlots: GrowthCalendarSlot[]
  createdAt: string
}

export interface GrowthChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface GrowthApprovalAuditEvent {
  id: string
  event: 'validated' | 'approved' | 'queued' | 'blocked'
  actor: 'local-user' | 'system'
  at: string
  notes: string
}

export interface PostPackage {
  id: string
  ideaId: string
  videoFile?: string
  coverFile?: string
  scriptDraft: string
  shotList: GrowthChecklistItem[]
  brollChecklist: GrowthChecklistItem[]
  coverTitleVariants: string[]
  platformVariants: Record<GrowthPlatform, {
    enabled: boolean
    title: string
    caption: string
    scheduledAt: string
    remotePostId?: string
  }>
  approvalState: GrowthPostApprovalState
  validationErrors: string[]
  approvalAudit: GrowthApprovalAuditEvent[]
  createdAt: string
  approvedAt?: string
  queuedAt?: string
}

export interface PostMetricSnapshot {
  id: string
  postPackageId: string
  ideaId?: string
  recipeId?: string
  topic?: string
  platform: GrowthPlatform
  measuredAt: string
  horizon: '1h' | '24h' | '72h' | '7d'
  metrics: GrowthMetricSet
  source: GrowthSignalSource
  confidence: GrowthSourceConfidence
  evidenceSummary: string
}

export interface GrowthConnectorStatus {
  id: string
  platform: GrowthPlatform
  status: GrowthConnectorStatusValue
  accountLabel?: string | null
  permissions: string[]
  requiredScopes: string[]
  service: string
  blockingReason?: string
  lastCheckedAt?: string
  lastSuccessfulReadOnlyCheckAt?: string | null
  reason?: string
  diagnostics: Record<string, unknown>
}

export interface GrowthOpsState {
  creatorWatchlist: CreatorWatchlist[]
  viralVideos: ViralVideo[]
  contentRecipes: ContentRecipe[]
  contentIdeas: ContentIdea[]
  postPackages: PostPackage[]
  metricSnapshots: PostMetricSnapshot[]
  quarantinedAnalyticsRows: GrowthQuarantinedAnalyticsRow[]
}
