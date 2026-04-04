import type { CSSProperties } from 'react'
import type {
  ApplyMode,
  ApplyRecommendation,
  JobAnalysis,
  JobFeedback,
  JobPriority,
  LifeMode,
  LiveJob,
  ReviewQueueItem,
  ReviewQueueMode,
  SavedSearch,
  SearchSourceKey,
  StageId,
  TrackedLead,
  WorkMode,
} from './job-hunter-types'

export const TRACKED_STORAGE_KEY = 'job-hunter-tracked-leads'
export const REVIEW_QUEUE_STORAGE_KEY = 'job-hunter-review-queue'
export const FEEDBACK_STORAGE_KEY = 'job-hunter-feedback'
export const SAVED_SEARCHES_STORAGE_KEY = 'job-hunter-saved-searches'
export const LIFE_MODE_STORAGE_KEY = 'job-hunter-life-mode'

export const STAGES: Array<{
  id: StageId
  label: string
  blurb: string
  accent: string
}> = [
  { id: 'sourcing', label: 'Sourcing', blurb: 'New jobs and target companies', accent: 'var(--blue)' },
  { id: 'applied', label: 'Applied', blurb: 'Applications and referrals sent', accent: 'var(--purple)' },
  { id: 'interviewing', label: 'Interviewing', blurb: 'Screens, calls, and onsite loops', accent: 'var(--secondary)' },
  { id: 'offer', label: 'Offer', blurb: 'Competing offers and closing steps', accent: 'var(--green)' },
  { id: 'archived', label: 'Archived', blurb: 'Paused or closed opportunities', accent: 'var(--text-muted)' },
]

export const DEFAULT_SOURCE_KEYS: SearchSourceKey[] = ['remotive', 'remoteok', 'arbeitnow']
export const BROWSER_REVIEW_MAX_AGE_DAYS = 14
export const BROWSER_REVIEW_MIN_SALARY_BUFFER = 0
export const BROWSER_REVIEW_KEYWORDS = /ai|automation|data|engineer|developer|intern|entry/
export const LOW_SIGNAL_SCORE_FLOOR = 25
const EASY_MODE_VISIBLE_LIMIT = 5
const EMPLUZZ_VISIBLE_LIMIT = 14
export const SOURCE_QUALITY: Record<string, number> = {
  remotive: 12,
  remoteok: 11,
  'remote ok': 11,
  arbeitnow: 10,
}
export const FEEDBACK_SCORE: Record<JobFeedback, number> = {
  good: 12,
  bad: -30,
  applied: 10,
  ignored: -16,
}

export const TARGET_PROFILE = {
  title: 'Your target profile',
  location: 'Fort Myers, FL 33905',
  focus: 'AI, automation, data annotation, IT, and entry-level computer engineering roles',
  background: 'Computer engineering student with self-built AI automation projects',
  workMode: 'Remote first, hybrid okay, local in Fort Myers as fallback',
  payFloor: 20,
  keywords: ['AI automation', 'data annotation', 'IT support', 'intern', 'entry level', 'computer engineering', 'no experience', 'remote'],
}

export const LIFE_MODE_CONFIG: Record<LifeMode, {
  label: string
  blurb: string
  defaultQuery: string
  searchLimit: number
  browserAssist: boolean
  smartFilter: boolean
  strictReviewFilter: boolean
  showOnlyBest: boolean
}> = {
  unemployed: {
    label: 'Unemployed mode',
    blurb: 'Fastest path to money. Fewer clicks, top matches only, stricter filtering.',
    defaultQuery: 'AI automation entry level intern remote',
    searchLimit: EASY_MODE_VISIBLE_LIMIT,
    browserAssist: true,
    smartFilter: true,
    strictReviewFilter: true,
    showOnlyBest: true,
  },
  employed: {
    label: 'Employed mode',
    blurb: 'Broader search space for people who can afford to browse more and compare more options.',
    defaultQuery: 'AI automation remote hybrid',
    searchLimit: EMPLUZZ_VISIBLE_LIMIT,
    browserAssist: false,
    smartFilter: true,
    strictReviewFilter: false,
    showOnlyBest: false,
  },
}

export const WORK_MODES: Array<{ id: WorkMode; label: string; description: string }> = [
  { id: 'remote-first', label: 'Remote first', description: 'Prioritize remote roles and keep location as a soft filter.' },
  { id: 'hybrid-ok', label: 'Hybrid okay', description: 'Accept hybrid roles if they pay well and fit your target field.' },
  { id: 'local-fallback', label: 'Local fallback', description: 'Prefer remote, but include Fort Myers-area roles when needed.' },
]

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function truncate(text: string, max = 180): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const end = clean.charAt(max) === ' ' ? max : clean.slice(0, max).lastIndexOf(' ')
  return `${clean.slice(0, end > 0 ? end : max).trim()}...`
}

export function loadTrackedLeads(): TrackedLead[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TRACKED_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is TrackedLead => {
      if (!item || typeof item !== 'object') return false
      const record = item as Record<string, unknown>
      return typeof record.id === 'string'
    })
  } catch {
    return []
  }
}

export function loadReviewQueue(): ReviewQueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(REVIEW_QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ReviewQueueItem => {
      if (!item || typeof item !== 'object') return false
      const record = item as Record<string, unknown>
      return typeof record.id === 'string'
    })
  } catch {
    return []
  }
}

export function loadFeedback(): Record<string, JobFeedback> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, JobFeedback>>((acc, [key, value]) => {
      if (value === 'good' || value === 'bad' || value === 'applied' || value === 'ignored') {
        acc[key] = value
      }
      return acc
    }, {})
  } catch {
    return {}
  }
}

export function loadSavedSearches(): SavedSearch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is SavedSearch => {
        if (!item || typeof item !== 'object') return false
        const record = item as Record<string, unknown>
        return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.query === 'string'
      })
      .map(item => ({
        ...item,
        lifeMode: item.lifeMode === 'employed' ? 'employed' : 'unemployed',
      }))
  } catch {
    return []
  }
}

export function loadLifeMode(): LifeMode {
  if (typeof window === 'undefined') return 'unemployed'
  try {
    const raw = localStorage.getItem(LIFE_MODE_STORAGE_KEY)
    return raw === 'employed' ? 'employed' : 'unemployed'
  } catch {
    return 'unemployed'
  }
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function jobKey(job: LiveJob): string {
  return normalizeText([job.company, job.title, job.location].join(' '))
}

export function ageInDays(value?: string | null): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return 0
  return Math.max(0, Math.floor((Date.now() - time) / 86400000))
}

export function sourceQuality(source: string): number {
  return SOURCE_QUALITY[normalizeText(source)] ?? 8
}

export function buildJobAnalysis(job: LiveJob, minimumHourlyRate: number, feedback?: JobFeedback): JobAnalysis {
  const recommendation = recommendApplication(job)
  const rate = estimateHourlyRate(job.salary)
  const key = jobKey(job)
  const ageDays = ageInDays(job.publishedAt)
  const title = normalizeText(`${job.title} ${job.category}`)
  const signals: string[] = []
  const reasons: string[] = []
  let score = 0

  score += sourceQuality(job.source)
  reasons.push(`${job.source} source`)

  if (recommendation.mode === 'direct') {
    score += 34
    signals.push('Direct apply')
    reasons.push('Direct company apply')
  } else if (recommendation.mode === 'manual') {
    score += 20
    signals.push('Manual apply')
    reasons.push('Use LinkedIn or Indeed search')
  } else {
    score += 8
    signals.push('Review first')
    reasons.push('Needs a quick human review')
  }

  if (rate != null) {
    const payScore = Math.min(24, Math.round(rate / 2))
    score += payScore
    reasons.push(`${formatHourlyRate(rate)} estimated hourly`)
    if (rate >= minimumHourlyRate) signals.push(`Meets $${minimumHourlyRate}/hr`)
  } else {
    score -= 4
    reasons.push('No pay listed')
  }

  if (ageDays <= 3) {
    score += 14
    signals.push('Fresh')
    reasons.push('Posted recently')
  } else if (ageDays <= 7) {
    score += 10
    signals.push('Recent')
  } else if (ageDays <= 14) {
    score += 5
    signals.push('Still fresh enough')
  } else if (ageDays > 30) {
    score -= 16
    signals.push('Possibly stale')
  }

  const keywordMatches = [
    /ai/.test(title),
    /automation/.test(title),
    /data/.test(title),
    /engineering/.test(title),
    /intern/.test(title),
    /entry/.test(title),
    /remote/.test(normalizeText(job.location)),
    /hybrid/.test(normalizeText(job.location)),
  ].filter(Boolean).length
  score += keywordMatches * 5
  if (keywordMatches > 0) {
    reasons.push('Matches your AI/entry-level target')
  }

  if (feedback) {
    score += FEEDBACK_SCORE[feedback]
    reasons.push(`Feedback: ${feedback}`)
  }

  if (job.summary && /apply|career|website|greenhouse|lever|workday|ashby|workable/i.test(job.summary)) {
    score += 4
    signals.push('ATS signal')
  }

  return {
    key,
    score,
    reasons,
    signals,
    ageDays,
    rate,
    feedback,
  }
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function nextStage(stage: StageId): StageId {
  switch (stage) {
    case 'sourcing': return 'applied'
    case 'applied': return 'interviewing'
    case 'interviewing': return 'offer'
    case 'offer': return 'archived'
    case 'archived': return 'archived'
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

export function badgeStyle(stage: StageId, priority?: JobPriority): CSSProperties {
  const stageAccent = STAGES.find(s => s.id === stage)?.accent || 'var(--accent)'
  const bg = priority === 'high'
    ? 'var(--red-a12)'
    : priority === 'low'
      ? 'var(--bg-white-05)'
      : 'var(--blue-a12)'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: stageAccent,
    background: bg,
    border: `1px solid color-mix(in oklab, ${stageAccent} 22%, transparent)`,
    textTransform: 'uppercase',
  }
}

export function leadFromJob(job: LiveJob): TrackedLead {
  return {
    id: createId(),
    company: job.company,
    role: job.title,
    location: job.location,
    source: `${job.source} search`,
    sourceId: job.sourceId,
    sourceUrl: job.url,
    stage: 'sourcing',
    nextAction: 'Tailor resume, apply, and send a follow-up note',
    due: 'Today',
    priority: 'high',
    tags: [job.category, job.jobType, 'live'],
    notes: job.summary,
  }
}

export function reviewQueueFromJob(job: LiveJob, mode: ReviewQueueMode): ReviewQueueItem {
  const recommendation = recommendApplication(job)
  const analysis = buildJobAnalysis(job, TARGET_PROFILE.payFloor)
  const salary = analysis.rate
  const recencyScore = job.publishedAt ? Math.max(0, 30 - Math.floor((Date.now() - new Date(job.publishedAt).getTime()) / 86400000)) : 8
  const salaryScore = salary == null ? 0 : Math.min(30, Math.round(salary / 2))
  const recommendationScore = recommendation.mode === 'direct' ? 40 : recommendation.mode === 'manual' ? 22 : 8
  const keywordScore = analysis.signals.includes('Direct apply') ? 4 : 0
  const score = recommendationScore + salaryScore + recencyScore + keywordScore
  return {
    id: createId(),
    company: job.company,
    role: job.title,
    source: job.source,
    url: job.url,
    mode,
    queuedAt: new Date().toISOString(),
    score,
    salaryScore,
    recencyScore,
    reason: uniqueStrings(analysis.reasons).slice(0, 3).join(' · '),
    signals: uniqueStrings(analysis.signals),
    feedback: analysis.feedback,
  }
}

export function shouldAutoQueueBrowserReview(job: LiveJob, minimumHourlyRate: number): boolean {
  const recommendation = recommendApplication(job)
  const salary = estimateHourlyRate(job.salary)
  const title = `${job.title} ${job.category}`.toLowerCase()
  const ageDays = job.publishedAt
    ? Math.floor((Date.now() - new Date(job.publishedAt).getTime()) / 86400000)
    : 0

  return (
    recommendation.mode === 'direct'
    && recommendation.route === 'company-site'
    && salary != null
    && salary >= minimumHourlyRate + BROWSER_REVIEW_MIN_SALARY_BUFFER
    && ageDays >= 0
    && ageDays <= BROWSER_REVIEW_MAX_AGE_DAYS
    && BROWSER_REVIEW_KEYWORDS.test(title)
  )
}

export function normalizeTags(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(Boolean)
}

export function buildSearchQuery(query: string, mode: WorkMode): string {
  const base = query.trim()
  const defaultQuery = 'AI automation data annotation entry level intern remote'
  const modeTokens: Record<WorkMode, string> = {
    'remote-first': 'remote',
    'hybrid-ok': 'remote hybrid',
    'local-fallback': 'remote hybrid Fort Myers 33905',
  }
  const q = base || defaultQuery
  return q.toLowerCase().includes('remote') || q.toLowerCase().includes('hybrid')
    ? q
    : `${q} ${modeTokens[mode]}`.trim()
}

export function serializeSources(sources: SearchSourceKey[]): string {
  return (sources.length > 0 ? sources : DEFAULT_SOURCE_KEYS).join(',')
}

export function toggleSource(sources: SearchSourceKey[], source: SearchSourceKey): SearchSourceKey[] {
  if (sources.includes(source)) {
    const next = sources.filter(item => item !== source)
    return next.length > 0 ? next : sources
  }
  return [...sources, source]
}

export function estimateHourlyRate(salary?: string | null): number | null {
  if (!salary) return null
  const normalized = salary.toLowerCase().replace(/,/g, '').trim()
  const numbers = normalized.match(/(?:\$)?(\d+(?:\.\d+)?)(k)?/g)
  if (!numbers || numbers.length === 0) return null

  const values = numbers.map((token) => {
    const clean = token.replace('$', '')
    const isK = clean.endsWith('k')
    const raw = Number.parseFloat(clean.replace('k', ''))
    if (Number.isNaN(raw)) return null
    return isK ? raw * 1000 : raw
  }).filter((value): value is number => value != null)

  if (values.length === 0) return null
  const midpoint = values.length > 1 ? (values[0] + values[1]) / 2 : values[0]

  if (/(?:\/\s*hr|hour|hourly|per hour)/.test(normalized)) {
    return midpoint
  }

  if (/(?:yr|year|ann?ual|salary)/.test(normalized)) {
    return midpoint / 2080
  }

  if (midpoint > 1000) {
    return midpoint / 2080
  }

  return midpoint
}

export function formatHourlyRate(rate: number): string {
  return `$${Math.round(rate).toLocaleString()}/hr`
}

export function buildLinkedInSearchUrl(job: LiveJob): string {
  const keywords = encodeURIComponent(`${job.title} ${job.company}`)
  const location = encodeURIComponent(job.location.includes('Remote') ? 'Remote' : job.location)
  return `https://www.linkedin.com/jobs/search/?keywords=${keywords}&location=${location}`
}

export function buildIndeedSearchUrl(job: LiveJob): string {
  const query = encodeURIComponent(`${job.title} ${job.company}`)
  const location = encodeURIComponent(job.location.includes('Remote') ? 'Remote' : job.location)
  return `https://www.indeed.com/jobs?q=${query}&l=${location}`
}

export function buildGoogleSearchUrl(job: LiveJob): string {
  const location = job.location.includes('Remote') ? 'remote' : job.location
  const query = [
    job.title,
    job.company,
    location,
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com OR site:jobs.workable.com',
  ].join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export function buildGoogleSearchUrlFromText(query: string, location: string): string {
  const text = [
    query,
    location,
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com OR site:jobs.workable.com',
  ].join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

export function recommendApplication(job: LiveJob): ApplyRecommendation {
  const title = `${job.title} ${job.category}`.toLowerCase()
  const salary = estimateHourlyRate(job.salary)
  const lowSignal = /intern|entry|assistant|annotation|support|qa|data/.test(title)
  const reviewFirst = !job.salary || salary == null || lowSignal

  if (reviewFirst) {
    return {
      route: 'google',
      label: 'Open web search',
      reason: 'Google is the fastest way to find the company site, ATS page, or a better application path.',
      url: buildGoogleSearchUrl(job),
      mode: 'review',
    }
  }

  if (/(intern|entry|support|assistant|annotation|ops|qa|data)/.test(title)) {
    return {
      route: 'indeed',
      label: 'Search Indeed',
      reason: 'Good fit for entry-level and volume-hiring roles.',
      url: buildIndeedSearchUrl(job),
      mode: 'manual',
    }
  }

  if (/(engineer|developer|automation|machine learning|ai|product)/.test(title)) {
    return {
      route: 'linkedin',
      label: 'Search LinkedIn',
      reason: 'Best for technical roles where networking and referrals matter.',
      url: buildLinkedInSearchUrl(job),
      mode: 'manual',
    }
  }

  return {
    route: 'company-site',
    label: 'Company website required',
    reason: 'Direct application gives you the cleanest path for this role.',
    url: job.url,
    mode: 'direct',
  }
}

export function applyModeLabel(mode: ApplyMode): string {
  switch (mode) {
    case 'direct':
      return 'Direct apply'
    case 'manual':
      return 'Manual search'
    case 'review':
      return 'Ping me'
  }
}

export function applyModeStyle(mode: ApplyMode): CSSProperties {
  switch (mode) {
    case 'direct':
      return badgeStyle('offer')
    case 'manual':
      return badgeStyle('applied')
    case 'review':
      return badgeStyle('interviewing')
  }
}

export function applyModeRank(mode: ApplyMode): number {
  switch (mode) {
    case 'direct':
      return 0
    case 'manual':
      return 1
    case 'review':
      return 2
  }
}
