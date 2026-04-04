export type StageId = 'sourcing' | 'applied' | 'interviewing' | 'offer' | 'archived'
export type JobPriority = 'high' | 'medium' | 'low'
export type WorkMode = 'remote-first' | 'hybrid-ok' | 'local-fallback'
export type SearchSourceKey = 'remotive' | 'remoteok' | 'arbeitnow'
export type LifeMode = 'unemployed' | 'employed'

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
