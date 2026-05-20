export type StageId = 'sourcing' | 'applied' | 'interviewing' | 'offer' | 'archived'
export type JobPriority = 'high' | 'medium' | 'low'
export type WorkMode = 'remote-first' | 'hybrid-ok' | 'local-fallback'
export type SearchSourceKey = 'remotive' | 'remoteok' | 'arbeitnow'
export type LifeMode = 'unemployed' | 'employed'
export type DossierRecommendation = 'pursue' | 'hold' | 'skip'
export type DossierSourceKind = 'live-search' | 'manual'
export type TimelineEventType = 'created' | 'evaluated' | 'asset-generated' | 'stage-changed' | 'note-added' | 'migrated'
export type CareerLane = 'cash-now' | 'engineering' | 'trainer'
export type GrowthPlatform = 'tiktok' | 'instagram' | 'youtube'
export type GrowthRecipeStatus = 'winning' | 'promising' | 'testing' | 'stale' | 'failed'
export type GrowthIdeaStatus = 'idea' | 'scripted' | 'recorded' | 'packaged' | 'posted' | 'archived'
export type GrowthPostApprovalState = 'draft' | 'needs-video' | 'ready-for-approval' | 'approved' | 'queued' | 'posted' | 'blocked'
export type GrowthSignalSource = 'owned-analytics' | 'watchlist' | 'manual-link' | 'approved-provider'
export type GrowthConnectorStatusValue =
  | 'not_configured'
  | 'configured'
  | 'oauth_required'
  | 'permission_missing'
  | 'review_required'
  | 'ready'
  | 'error'

export interface CareerProfile {
  targetRoles: string[]
  payFloor: number
  preferredLocations: string[]
  narrative: string
  strengths: string[]
  urgencyMode: 'urgent-active-search'
  lanes?: CareerLane[]
  payFloors?: Record<CareerLane, number>
  availability?: string
  resumePacket?: ApplicationPacket
  links?: Record<string, string>
}

export interface ApplicationPacket {
  baseBullets: string[]
  workHistory: string[]
  projectProof: string[]
  trainerPitch: string
  engineeringPitch: string
  coverTemplates: Record<CareerLane, string>
  commonAnswers: Record<string, string>
}

export interface DossierEvaluation {
  fitScore: number
  recommendation: DossierRecommendation
  reasonsToPursue: string[]
  reasonsToAvoid: string[]
  riskFlags: string[]
  confidenceGaps: string[]
}

export interface DossierAssetSet {
  resumeBullets: string[]
  coverNote: string
  outreachBlurb: string
  interviewPrompts: string[]
  callScript?: string
  followUpNote?: string
}

export interface DossierTimelineEvent {
  id: string
  type: TimelineEventType
  at: string
  label: string
}

export interface OpportunityDossier {
  id: string
  company: string
  role: string
  location: string
  lane?: CareerLane
  source: {
    kind: DossierSourceKind
    label: string
    sourceId?: string
    url?: string
  }
  salaryText: string
  estimatedHourlyRate: number | null
  summary: string
  stage: StageId
  nextAction: string
  due: string
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
  evaluation: DossierEvaluation
  assets: DossierAssetSet
  timeline: DossierTimelineEvent[]
  fingerprint?: string
}

export interface TrackedLead {
  id: string
  company: string
  role: string
  location: string
  source: string
  sourceId?: string
  sourceUrl?: string
  stage: StageId
  nextAction: string
  due: string
  priority: JobPriority
  tags: string[]
  notes: string
}

export interface JobForm {
  company: string
  role: string
  location: string
  source: string
  stage: StageId
  nextAction: string
  due: string
  priority: JobPriority
  tags: string
  notes: string
}

export interface LiveJob {
  id: string
  source: string
  sourceId: string
  title: string
  company: string
  category: string
  jobType: string
  location: string
  salary?: string | null
  publishedAt?: string | null
  url: string
  companyLogo?: string | null
  summary: string
}

export interface JobSearchResponse {
  query: string
  count: number
  jobs: LiveJob[]
}

export interface LeadReminder {
  id: string
  label: string
  detail: string
  stage: StageId
}

export type ApplyRoute = 'google' | 'linkedin' | 'indeed' | 'company-site'
export type ApplyMode = 'direct' | 'manual' | 'review'
export type ReviewQueueMode = 'browser' | 'manual'
export type JobFeedback = 'good' | 'bad' | 'applied' | 'ignored'

export interface ApplyRecommendation {
  route: ApplyRoute
  label: string
  reason: string
  url: string
  mode: ApplyMode
}

export interface ReviewQueueItem {
  id: string
  company: string
  role: string
  source: string
  url: string
  mode: ReviewQueueMode
  queuedAt: string
  score: number
  salaryScore: number
  recencyScore: number
  reason: string
  signals: string[]
  feedback?: JobFeedback
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  mode: WorkMode
  lifeMode: LifeMode
  sources: SearchSourceKey[]
  smartFilter: boolean
  minimumHourlyRate: number
  createdAt: string
}

export interface JobAnalysis {
  key: string
  score: number
  reasons: string[]
  signals: string[]
  ageDays: number
  rate: number | null
  feedback?: JobFeedback
}

export interface RankedJobCard {
  job: LiveJob
  recommendation: ApplyRecommendation
  analysis: JobAnalysis
}

export interface CareerApplication {
  id: string
  dossierId: string
  batchId?: string | null
  status: string
  submitMode: string
  preparedAnswers: Record<string, unknown>
  packetSnapshot: Record<string, unknown>
  requiredFields: string[]
  riskFlags: string[]
  audit: Array<Record<string, unknown>>
  createdAt: string
  updatedAt: string
}

export interface CareerOutcome {
  id: string
  dossierId?: string | null
  applicationId?: string | null
  outcome: 'callback' | 'rejection' | 'interview' | 'offer' | 'ignored'
  callbackQuality?: string | null
  pay?: string | null
  lesson: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CareerSearchRun {
  id: string
  lane: CareerLane
  query: string
  sourceSet: string[]
  filters: Record<string, unknown>
  resultCount: number
  dedupeFingerprints: string[]
  createdDossierIds: string[]
  createdAt: string
  updatedAt: string
}

export interface PreparedApplicationBatch {
  batchId: string
  applications: Array<{
    application: CareerApplication
    dossier: OpportunityDossier
  }>
  approval: {
    id: string
    action: string
    summary: string
    risk: 'low' | 'medium' | 'high'
    status: string
    expiresAt: string
    scope: Record<string, unknown>
  }
}

export interface CareerBrowserTask {
  applicationId: string
  dossierId: string
  company: string
  role: string
  url: string
  answers: Record<string, unknown>
  requiredFields: string[]
  hardStops: string[]
  fillMode?: string
  fillInstructions?: string
  fillScript?: string
}

export interface ExecutedApplicationBatch {
  batchId: string
  status: string
  hardStops: string[]
  applications: CareerApplication[]
  browserTasks: CareerBrowserTask[]
}

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
  lastReviewedAt?: string
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
  createdAt: string
}

export interface PostPackage {
  id: string
  ideaId: string
  videoFile?: string
  coverFile?: string
  platformVariants: Record<GrowthPlatform, {
    enabled: boolean
    title: string
    caption: string
    scheduledAt: string
    remotePostId?: string
  }>
  approvalState: GrowthPostApprovalState
  validationErrors: string[]
  createdAt: string
  approvedAt?: string
}

export interface PostMetricSnapshot {
  id: string
  postPackageId: string
  platform: GrowthPlatform
  measuredAt: string
  horizon: '1h' | '24h' | '72h' | '7d'
  metrics: GrowthMetricSet
}

export interface GrowthConnectorStatus {
  id: string
  platform: GrowthPlatform
  status: GrowthConnectorStatusValue
  accountLabel?: string | null
  permissions: string[]
  lastCheckedAt?: string
  reason?: string
}

export interface GrowthOpsState {
  creatorWatchlist: CreatorWatchlist[]
  viralVideos: ViralVideo[]
  contentRecipes: ContentRecipe[]
  contentIdeas: ContentIdea[]
  postPackages: PostPackage[]
  metricSnapshots: PostMetricSnapshot[]
}
