import type { CSSProperties } from 'react'
import type {
  CareerProfile,
  ApplyMode,
  ApplyRecommendation,
  DossierAssetSet,
  DossierEvaluation,
  DossierRecommendation,
  DossierTimelineEvent,
  JobAnalysis,
  JobFeedback,
  JobPriority,
  LifeMode,
  LiveJob,
  OpportunityDossier,
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
export const DOSSIER_STORAGE_KEY = 'career-ops-dossiers'
export const PROFILE_STORAGE_KEY = 'career-ops-profile'

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
export const BROWSER_REVIEW_KEYWORDS = /ai|automation|data|engineer|developer|intern|entry|support|assistant|ops|qa|annotation/
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

const DEFAULT_DOSSIER_EVALUATION: DossierEvaluation = {
  fitScore: 0,
  recommendation: 'hold',
  reasonsToPursue: [],
  reasonsToAvoid: [],
  riskFlags: [],
  confidenceGaps: [],
}

const FALLBACK_TIMESTAMP = '1970-01-01T00:00:00.000Z'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
  return normalized.length > 0 ? normalized : fallback
}

function normalizeTimestamp(value: unknown, fallback = FALLBACK_TIMESTAMP): string {
  if (typeof value !== 'string') return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

function createDefaultTimelineEvent(type: DossierTimelineEvent['type'], label: string): DossierTimelineEvent {
  return {
    id: createId(),
    type,
    at: new Date().toISOString(),
    label,
  }
}

function defaultDossierEvaluation(): DossierEvaluation {
  return {
    ...DEFAULT_DOSSIER_EVALUATION,
    reasonsToPursue: [],
    reasonsToAvoid: [],
    riskFlags: [],
    confidenceGaps: [],
  }
}

function normalizeDossierAssets(value: unknown): DossierAssetSet {
  if (!isRecord(value)) {
    return createEmptyAssets()
  }
  return {
    resumeBullets: normalizeStringArray(value.resumeBullets),
    coverNote: typeof value.coverNote === 'string' ? value.coverNote : '',
    outreachBlurb: typeof value.outreachBlurb === 'string' ? value.outreachBlurb : '',
    interviewPrompts: normalizeStringArray(value.interviewPrompts),
  }
}

function normalizeDossierEvaluation(value: unknown): DossierEvaluation {
  if (!isRecord(value)) {
    return defaultDossierEvaluation()
  }
  return {
    fitScore: typeof value.fitScore === 'number' ? value.fitScore : 0,
    recommendation:
      value.recommendation === 'pursue' || value.recommendation === 'hold' || value.recommendation === 'skip'
        ? value.recommendation
        : 'hold',
    reasonsToPursue: normalizeStringArray(value.reasonsToPursue),
    reasonsToAvoid: normalizeStringArray(value.reasonsToAvoid),
    riskFlags: normalizeStringArray(value.riskFlags),
    confidenceGaps: normalizeStringArray(value.confidenceGaps),
  }
}

function normalizeTimeline(value: unknown, fallbackLabel: string): DossierTimelineEvent[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [createDefaultTimelineEvent('created', fallbackLabel)]
  }
  const timeline = value.filter((item): item is DossierTimelineEvent => {
    if (!isRecord(item)) return false
    return typeof item.id === 'string'
      && (item.type === 'created'
        || item.type === 'evaluated'
        || item.type === 'asset-generated'
        || item.type === 'stage-changed'
        || item.type === 'note-added'
        || item.type === 'migrated')
      && typeof item.at === 'string'
      && typeof item.label === 'string'
  })
  return timeline.length > 0 ? timeline : [createDefaultTimelineEvent('created', fallbackLabel)]
}

function safeTimestampMs(value: string): number {
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? 0 : time
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function sameDossierAssets(a: DossierAssetSet, b: DossierAssetSet): boolean {
  return a.coverNote === b.coverNote
    && a.outreachBlurb === b.outreachBlurb
    && sameStringArray(a.resumeBullets, b.resumeBullets)
    && sameStringArray(a.interviewPrompts, b.interviewPrompts)
}

function sameDossierEvaluation(a: DossierEvaluation, b: DossierEvaluation): boolean {
  return a.fitScore === b.fitScore
    && a.recommendation === b.recommendation
    && sameStringArray(a.reasonsToPursue, b.reasonsToPursue)
    && sameStringArray(a.reasonsToAvoid, b.reasonsToAvoid)
    && sameStringArray(a.riskFlags, b.riskFlags)
    && sameStringArray(a.confidenceGaps, b.confidenceGaps)
}

function upsertTimelineEvent(
  timeline: DossierTimelineEvent[],
  type: DossierTimelineEvent['type'],
  label: string,
  at: string,
): DossierTimelineEvent[] {
  const existingIndex = timeline.findIndex(event => event.type === type)
  const nextEvent: DossierTimelineEvent = existingIndex >= 0
    ? { ...timeline[existingIndex], label, at }
    : { id: createId(), type, label, at }

  if (existingIndex < 0) {
    return [nextEvent, ...timeline]
  }

  return timeline.map((event, index) => (index === existingIndex ? nextEvent : event))
}

function normalizeDossier(value: unknown): OpportunityDossier | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string'
    || typeof value.company !== 'string'
    || typeof value.role !== 'string'
    || typeof value.location !== 'string'
    || !isRecord(value.source)
    || typeof value.salaryText !== 'string'
    || typeof value.summary !== 'string'
    || typeof value.stage !== 'string'
    || typeof value.nextAction !== 'string'
    || typeof value.due !== 'string'
    || typeof value.notes !== 'string'
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string'
  ) {
    return null
  }

  const stage = value.stage as StageId
  if (!['sourcing', 'applied', 'interviewing', 'offer', 'archived'].includes(stage)) {
    return null
  }

  const sourceKind = value.source.kind === 'manual' ? 'manual' : 'live-search'
  return {
    id: value.id,
    company: value.company,
    role: value.role,
    location: value.location,
    source: {
      kind: sourceKind,
      label: typeof value.source.label === 'string' ? value.source.label : '',
      sourceId: typeof value.source.sourceId === 'string' ? value.source.sourceId : undefined,
      url: typeof value.source.url === 'string' ? value.source.url : undefined,
    },
    salaryText: value.salaryText,
    estimatedHourlyRate: typeof value.estimatedHourlyRate === 'number' ? value.estimatedHourlyRate : null,
    summary: value.summary,
    stage,
    nextAction: value.nextAction,
    due: value.due,
    tags: normalizeStringArray(value.tags),
    notes: value.notes,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
    evaluation: normalizeDossierEvaluation(value.evaluation),
    assets: normalizeDossierAssets(value.assets),
    timeline: normalizeTimeline(value.timeline, 'Dossier loaded from storage'),
  }
}

export function loadDossiers(): OpportunityDossier[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(DOSSIER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeDossier).filter((item): item is OpportunityDossier => item != null)
  } catch {
    return []
  }
}

export function saveDossiers(dossiers: OpportunityDossier[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify(dossiers))
}

export function defaultCareerProfile(): CareerProfile {
  return {
    targetRoles: ['AI automation', 'data annotation', 'IT support', 'entry level engineering'],
    payFloor: TARGET_PROFILE.payFloor,
    preferredLocations: ['Remote - US', 'Fort Myers, FL'],
    narrative: TARGET_PROFILE.background,
    strengths: ['AI automation projects', 'computer engineering coursework', 'self-directed tooling'],
    urgencyMode: 'urgent-active-search',
  }
}

export function loadCareerProfile(): CareerProfile {
  if (typeof window === 'undefined') return defaultCareerProfile()
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return defaultCareerProfile()
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return defaultCareerProfile()
    return {
      ...defaultCareerProfile(),
      targetRoles: normalizeStringArray(parsed.targetRoles, defaultCareerProfile().targetRoles),
      payFloor: typeof parsed.payFloor === 'number' ? parsed.payFloor : defaultCareerProfile().payFloor,
      preferredLocations: normalizeStringArray(parsed.preferredLocations, defaultCareerProfile().preferredLocations),
      narrative: typeof parsed.narrative === 'string' ? parsed.narrative : defaultCareerProfile().narrative,
      strengths: normalizeStringArray(parsed.strengths, defaultCareerProfile().strengths),
      urgencyMode: 'urgent-active-search',
    }
  } catch {
    return defaultCareerProfile()
  }
}

export function saveCareerProfile(profile: CareerProfile): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

export function createEmptyAssets(): DossierAssetSet {
  return {
    resumeBullets: [],
    coverNote: '',
    outreachBlurb: '',
    interviewPrompts: [],
  }
}

function defaultDossier(sourceLabel: string, timelineLabel: string): Omit<OpportunityDossier, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    company: '',
    role: '',
    location: '',
    source: { kind: 'manual', label: sourceLabel },
    salaryText: '',
    estimatedHourlyRate: null,
    summary: '',
    stage: 'sourcing',
    nextAction: '',
    due: 'Today',
    tags: [],
    notes: '',
    evaluation: defaultDossierEvaluation(),
    assets: createEmptyAssets(),
    timeline: [createDefaultTimelineEvent('created', timelineLabel)],
  }
}

function buildCreatedDossier(base: Omit<OpportunityDossier, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): OpportunityDossier {
  const now = new Date().toISOString()
  const { id, ...rest } = base
  return {
    ...rest,
    id: id ?? createId(),
    createdAt: now,
    updatedAt: now,
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

export function createDossierFromJob(job: LiveJob): OpportunityDossier {
  return buildCreatedDossier({
    ...defaultDossier(job.source, 'Dossier created from live search'),
    company: job.company,
    role: job.title,
    location: job.location,
    source: {
      kind: 'live-search',
      label: job.source,
      sourceId: job.sourceId,
      url: job.url,
    },
    salaryText: job.salary ?? '',
    estimatedHourlyRate: estimateHourlyRate(job.salary),
    summary: truncate(job.summary, 280),
    nextAction: 'Review fit and tailor application assets',
    tags: uniqueStrings([job.category, job.jobType, 'live']),
    notes: job.summary,
  })
}

export function createDossierFromManualIntake(input: {
  company: string
  role: string
  location: string
  description: string
  sourceLabel: string
  sourceUrl?: string
}): OpportunityDossier {
  return buildCreatedDossier({
    ...defaultDossier(input.sourceLabel, 'Dossier created from manual intake'),
    company: input.company,
    role: input.role,
    location: input.location,
    source: {
      kind: 'manual',
      label: input.sourceLabel,
      url: input.sourceUrl,
    },
    summary: truncate(input.description, 280),
    nextAction: 'Score opportunity and tailor assets',
    notes: input.description,
  })
}

export function migrateLeadToDossier(lead: TrackedLead): OpportunityDossier {
  const priorityScore = lead.priority === 'high' ? 70 : lead.priority === 'medium' ? 55 : 40
  return buildCreatedDossier({
    ...defaultDossier(lead.source, 'Migrated from tracked lead'),
    id: lead.id,
    company: lead.company,
    role: lead.role,
    location: lead.location,
    source: {
      kind: 'manual',
      label: lead.source,
      sourceId: lead.sourceId,
      url: lead.sourceUrl,
    },
    stage: lead.stage,
    nextAction: lead.nextAction,
    due: lead.due,
    tags: lead.tags,
    summary: truncate(lead.notes, 280),
    notes: lead.notes,
    timeline: [createDefaultTimelineEvent('migrated', 'Migrated from tracked lead')],
    evaluation: {
      ...defaultDossierEvaluation(),
      fitScore: priorityScore,
      recommendation: lead.priority === 'high' ? 'pursue' : 'hold',
    },
  })
}

export function dossierToTrackedLead(dossier: OpportunityDossier): TrackedLead {
  const recommendation = dossier.evaluation.recommendation
  const priority: JobPriority = recommendation === 'pursue'
    ? 'high'
    : recommendation === 'hold'
      ? 'medium'
      : 'low'

  return {
    id: dossier.id,
    company: dossier.company,
    role: dossier.role,
    location: dossier.location,
    source: dossier.source.label,
    sourceId: dossier.source.sourceId,
    sourceUrl: dossier.source.url,
    stage: dossier.stage,
    nextAction: dossier.nextAction,
    due: dossier.due,
    priority,
    tags: dossier.tags,
    notes: dossier.notes,
  }
}

function dossierUrgencyRank(due: string): number {
  const normalized = normalizeText(due)
  if (!normalized) return 10
  if (normalized.includes('today') || normalized.includes('now') || normalized.includes('asap')) return 0
  if (normalized.includes('tomorrow')) return 1
  if (normalized.includes('soon') || normalized.includes('week')) return 2
  const parsed = new Date(due)
  if (!Number.isNaN(parsed.getTime())) {
    return Math.max(0, Math.floor((parsed.getTime() - Date.now()) / 86400000) + 3)
  }
  return 10
}

export function evaluateDossier(dossier: OpportunityDossier, profile = defaultCareerProfile()): OpportunityDossier {
  const haystack = normalizeText([dossier.role, dossier.summary, dossier.location, dossier.notes].join(' '))
  const rate = dossier.estimatedHourlyRate
  const reasonsToPursue: string[] = []
  const reasonsToAvoid: string[] = []
  const riskFlags: string[] = []
  const confidenceGaps: string[] = []
  let fitScore = 0

  if (profile.targetRoles.some(term => haystack.includes(normalizeText(term)))) {
    fitScore += 28
    reasonsToPursue.push('Matches target role family')
  } else {
    reasonsToAvoid.push('Weak match against current target role family')
  }

  const preferredLocations = profile.preferredLocations.map(normalizeText)
  if (preferredLocations.some(location => location && haystack.includes(location))) {
    fitScore += 14
    reasonsToPursue.push('Location looks compatible')
  }

  if (rate != null && rate >= profile.payFloor) {
    fitScore += 22
    reasonsToPursue.push(`Estimated pay meets $${profile.payFloor}/hr floor`)
  } else if (rate == null) {
    confidenceGaps.push('Compensation not listed')
  } else {
    reasonsToAvoid.push('Estimated compensation is below target floor')
  }

  if (/intern|entry|support|automation|data|it/.test(haystack)) {
    fitScore += 18
    reasonsToPursue.push('Strong adjacency to current proof points')
  }

  if (!/apply|greenhouse|lever|workday|ashby|workable|career/.test(haystack)) {
    riskFlags.push('Application path unclear')
  }

  const recommendation: DossierRecommendation = fitScore >= 70 ? 'pursue' : fitScore >= 45 ? 'hold' : 'skip'
  const nextEvaluation: DossierEvaluation = {
    fitScore,
    recommendation,
    reasonsToPursue,
    reasonsToAvoid,
    riskFlags,
    confidenceGaps,
  }

  if (sameDossierEvaluation(dossier.evaluation, nextEvaluation)) {
    return dossier
  }

  return {
    ...dossier,
    updatedAt: new Date().toISOString(),
    evaluation: nextEvaluation,
  }
}

function summarizeNarrative(profile: CareerProfile): string {
  const narrative = profile.narrative.trim().replace(/\.$/, '')
  return narrative || 'hands-on technical work'
}

function formatStrength(strength: string): string {
  const clean = strength.trim().replace(/\s+/g, ' ')
  if (!clean) return 'hands-on technical execution'
  if (clean.includes(' ')) return clean

  const tokens = [
    'workflow',
    'automation',
    'ticket',
    'triage',
    'customer',
    'communication',
    'technical',
    'support',
    'fast',
    'learning',
    'computer',
    'engineering',
    'self',
    'directed',
    'tooling',
    'projects',
    'data',
    'annotation',
    'ai',
  ]

  const matches = clean.toLowerCase().match(new RegExp(tokens.join('|'), 'g'))
  return matches && matches.join('').length >= clean.length - 2
    ? matches.join(' ')
    : clean
}

function roleTheme(dossier: OpportunityDossier): string {
  const haystack = normalizeText([dossier.role, dossier.summary, dossier.notes].join(' '))
  if (/support|ticket|help desk|customer/.test(haystack)) return 'support operations'
  if (/automation|workflow|integration|ai/.test(haystack)) return 'automation workflows'
  if (/data|annotation|analyst|report/.test(haystack)) return 'data quality work'
  if (/qa|test|quality/.test(haystack)) return 'quality and reliability work'
  return dossier.role.toLowerCase()
}

export function generateDossierAssets(dossier: OpportunityDossier, profile: CareerProfile): OpportunityDossier {
  const strengths = uniqueStrings(profile.strengths.map(item => item.trim()).filter(Boolean))
  const primaryStrength = formatStrength(strengths[0] ?? 'hands-on technical execution')
  const secondaryStrength = formatStrength(strengths[1] ?? primaryStrength)
  const narrative = summarizeNarrative(profile)
  const theme = roleTheme(dossier)
  const locationCue = dossier.location.trim() || profile.preferredLocations[0] || 'the team setup'
  const summaryCue = truncate(dossier.summary || dossier.notes || dossier.role, 90)

  const nextAssets: DossierAssetSet = {
    resumeBullets: [
      `Position ${primaryStrength} as proof you can deliver ${theme} results for ${dossier.company}.`,
      `Connect ${secondaryStrength} to the ${dossier.role} scope by referencing ${summaryCue.toLowerCase()}.`,
      `Frame your story around ${narrative.toLowerCase()} and why ${locationCue} works for your current search.`,
    ],
    coverNote: `I’m interested in the ${dossier.role} opportunity at ${dossier.company} because it lines up with my background in ${primaryStrength.toLowerCase()} and my track record of turning ambiguous work into practical results. ${narrative}.`,
    outreachBlurb: `Hi, I’m reaching out about the ${dossier.role} opening at ${dossier.company}. My background in ${secondaryStrength.toLowerCase()} and self-directed project work maps well to the team’s ${theme} needs.`,
    interviewPrompts: [
      `Which ${dossier.company} priorities matter most for this ${theme} role in the first 90 days?`,
      `What example best shows you can step into ${dossier.role} work with limited ramp time?`,
      `How will you explain that ${locationCue} still supports strong execution for this team?`,
    ],
  }

  if (sameDossierAssets(dossier.assets, nextAssets)) {
    return dossier
  }

  const now = new Date().toISOString()
  return {
    ...dossier,
    updatedAt: now,
    assets: nextAssets,
    timeline: upsertTimelineEvent(dossier.timeline, 'asset-generated', 'Generated tailored assets', now),
  }
}

export function sortDossiersForQueue(dossiers: OpportunityDossier[]): OpportunityDossier[] {
  const recommendationRank: Record<DossierRecommendation, number> = {
    pursue: 0,
    hold: 1,
    skip: 2,
  }

  return [...dossiers].sort((a, b) => {
    const rec = recommendationRank[a.evaluation.recommendation] - recommendationRank[b.evaluation.recommendation]
    if (rec !== 0) return rec

    const urgency = dossierUrgencyRank(a.due) - dossierUrgencyRank(b.due)
    if (urgency !== 0) return urgency

    const score = b.evaluation.fitScore - a.evaluation.fitScore
    if (score !== 0) return score

    return safeTimestampMs(b.updatedAt) - safeTimestampMs(a.updatedAt)
  })
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
    recommendation.mode !== 'direct'
    && (salary == null || salary >= minimumHourlyRate + BROWSER_REVIEW_MIN_SALARY_BUFFER)
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
  const entryLevelTarget = /(intern|entry|support|assistant|annotation|ops|qa|data)/.test(title)
  const technicalTarget = /(engineer|developer|automation|machine learning|ai|product)/.test(title)

  if (entryLevelTarget) {
    return {
      route: 'indeed',
      label: 'Search Indeed',
      reason: 'Good fit for entry-level and volume-hiring roles.',
      url: buildIndeedSearchUrl(job),
      mode: 'manual',
    }
  }

  if (technicalTarget) {
    return {
      route: 'linkedin',
      label: 'Search LinkedIn',
      reason: 'Best for technical roles where networking and referrals matter.',
      url: buildLinkedInSearchUrl(job),
      mode: 'manual',
    }
  }

  if (!job.salary || salary == null) {
    return {
      route: 'google',
      label: 'Open web search',
      reason: 'Google is the fastest way to find the company site, ATS page, or a better application path.',
      url: buildGoogleSearchUrl(job),
      mode: 'review',
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
    default:
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
    default:
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
    default:
      return 2
  }
}
