export type StageId = 'sourcing' | 'applied' | 'interviewing' | 'offer' | 'archived'
export type JobPriority = 'high' | 'medium' | 'low'
export type WorkMode = 'remote-first' | 'hybrid-ok' | 'local-fallback'
export type SearchSourceKey = 'remotive' | 'remoteok' | 'arbeitnow'
export type LifeMode = 'unemployed' | 'employed'
export type DossierRecommendation = 'pursue' | 'hold' | 'skip'
export type DossierSourceKind = 'live-search' | 'manual'
export type TimelineEventType = 'created' | 'evaluated' | 'asset-generated' | 'stage-changed' | 'note-added' | 'migrated'

export interface CareerProfile {
  targetRoles: string[]
  payFloor: number
  preferredLocations: string[]
  narrative: string
  strengths: string[]
  urgencyMode: 'urgent-active-search'
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
