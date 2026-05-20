import type { CSSProperties } from 'react'
import type {
  CareerProfile,
  CareerLane,
  ApplyMode,
  ApplyRecommendation,
  ContentIdea,
  ContentRecipe,
  CreatorWatchlist,
  DossierAssetSet,
  DossierEvaluation,
  DossierRecommendation,
  DossierTimelineEvent,
  GrowthIdeaStatus,
  GrowthMetricSet,
  GrowthOpsState,
  GrowthPlatform,
  GrowthPostApprovalState,
  GrowthRecipeStatus,
  JobAnalysis,
  JobFeedback,
  JobPriority,
  LifeMode,
  LiveJob,
  OpportunityDossier,
  PostMetricSnapshot,
  PostPackage,
  RankedJobCard,
  ReviewQueueItem,
  ReviewQueueMode,
  SavedSearch,
  SearchSourceKey,
  StageId,
  TrackedLead,
  ViralVideo,
  WorkMode,
} from './types'

export const TRACKED_STORAGE_KEY = 'job-hunter-tracked-leads'
export const REVIEW_QUEUE_STORAGE_KEY = 'job-hunter-review-queue'
export const FEEDBACK_STORAGE_KEY = 'job-hunter-feedback'
export const SAVED_SEARCHES_STORAGE_KEY = 'job-hunter-saved-searches'
export const LIFE_MODE_STORAGE_KEY = 'job-hunter-life-mode'
export const DOSSIER_STORAGE_KEY = 'career-ops-dossiers'
export const PROFILE_STORAGE_KEY = 'career-ops-profile'
export const CAREER_OPS_MIGRATION_KEY = 'career-ops-sqlite-migrated-v1'
export const GROWTH_OPS_STORAGE_KEY = 'career-ops-growth-v1'
export const GROWTH_OPS_LOCAL_STORAGE_KEY = 'growth-ops-v2_5-local-state'
export const GROWTH_OPS_MIGRATED_KEY = 'growth-ops-v2_5-migrated-from-career-ops-growth-v1'
export const GROWTH_OPS_PENDING_UPLOAD_KEY = 'growth-ops-v2_5-pending-upload'
export const GROWTH_SECRET_SERVICES = ['social.tiktok', 'social.instagram', 'social.youtube'] as const

export const CAREER_LANES: Array<{ id: CareerLane; label: string; blurb: string }> = [
  { id: 'cash-now', label: 'Cash Now', blurb: 'Fort Myers part-time and fast-hire work first.' },
  { id: 'engineering', label: 'Career Track', blurb: 'AI, IT, data, internship, and engineering roles.' },
  { id: 'trainer', label: 'Trainer Growth', blurb: 'Trainer jobs, coaching leads, content, and local client book.' },
]

export const CASH_NOW_QUERIES = [
  'part time Fort Myers $18',
  'evening part time Fort Myers',
  'weekend part time Fort Myers',
  'front desk gym Fort Myers',
  'server part time Fort Myers',
  'warehouse part time Fort Myers',
  'retail part time Fort Myers',
  'IT support part time Fort Myers',
  'hotel front desk part time Fort Myers',
  'restaurant host part time Fort Myers',
  'grocery part time Fort Myers',
  'delivery driver part time Fort Myers',
  'valet attendant part time Fort Myers',
  'receptionist part time Fort Myers',
]

export const CASH_NOW_COMPANY_TARGETS = [
  'Publix',
  'Target',
  'Walmart',
  'Aldi',
  'Costco',
  'Home Depot',
  "Lowe's",
  'UPS',
  'FedEx',
  'Chick-fil-A',
  'Crunch Fitness',
  'Amped Fitness',
]

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
export const BROWSER_REVIEW_KEYWORDS =
  /ai|automation|data|engineer|developer|intern|entry|support|assistant|ops|qa|annotation/
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
  keywords: [
    'AI automation',
    'data annotation',
    'IT support',
    'intern',
    'entry level',
    'computer engineering',
    'no experience',
    'remote',
  ],
}

export const LIFE_MODE_CONFIG: Record<
  LifeMode,
  {
    label: string
    blurb: string
    defaultQuery: string
    searchLimit: number
    browserAssist: boolean
    smartFilter: boolean
    strictReviewFilter: boolean
    showOnlyBest: boolean
  }
> = {
  unemployed: {
    label: 'Unemployed mode',
    blurb: 'Fastest path to money. Fort Myers part-time first, then career-track upside.',
    defaultQuery: CASH_NOW_QUERIES[0],
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
  {
    id: 'remote-first',
    label: 'Remote first',
    description: 'Prioritize remote roles and keep location as a soft filter.',
  },
  {
    id: 'hybrid-ok',
    label: 'Hybrid okay',
    description: 'Accept hybrid roles if they pay well and fit your target field.',
  },
  {
    id: 'local-fallback',
    label: 'Local fallback',
    description: 'Prefer remote, but include Fort Myers-area roles when needed.',
  },
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
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, JobFeedback>>(
      (acc, [key, value]) => {
        if (value === 'good' || value === 'bad' || value === 'applied' || value === 'ignored') {
          acc[key] = value
        }
        return acc
      },
      {},
    )
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

export function defaultCareerSavedSearches(): SavedSearch[] {
  const createdAt = '2026-05-12T00:00:00.000Z'
  return [
    {
      id: 'default-cash-now-part-time-fort-myers',
      name: 'Cash Now: Fort Myers $18+',
      query: CASH_NOW_QUERIES[0],
      mode: 'local-fallback',
      lifeMode: 'unemployed',
      sources: DEFAULT_SOURCE_KEYS,
      smartFilter: true,
      minimumHourlyRate: 18,
      createdAt,
    },
    {
      id: 'default-cash-now-evening-weekend',
      name: 'Cash Now: evening/weekend',
      query: 'evening weekend part time Fort Myers $18',
      mode: 'local-fallback',
      lifeMode: 'unemployed',
      sources: DEFAULT_SOURCE_KEYS,
      smartFilter: true,
      minimumHourlyRate: 18,
      createdAt,
    },
    {
      id: 'default-engineering-entry',
      name: 'Career Track: entry AI/IT',
      query: 'AI automation IT support data annotation entry level',
      mode: 'hybrid-ok',
      lifeMode: 'unemployed',
      sources: DEFAULT_SOURCE_KEYS,
      smartFilter: true,
      minimumHourlyRate: 18,
      createdAt,
    },
    {
      id: 'default-trainer-growth',
      name: 'Trainer Growth: gym/client leads',
      query: 'personal trainer gym front desk online coaching Fort Myers',
      mode: 'local-fallback',
      lifeMode: 'unemployed',
      sources: DEFAULT_SOURCE_KEYS,
      smartFilter: true,
      minimumHourlyRate: 18,
      createdAt,
    },
  ]
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

function normalizeStringRecord(value: unknown, fallback: Record<string, string> = {}): Record<string, string> {
  if (!isRecord(value)) return fallback
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
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
    callScript: typeof value.callScript === 'string' ? value.callScript : '',
    followUpNote: typeof value.followUpNote === 'string' ? value.followUpNote : '',
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
    return (
      typeof item.id === 'string' &&
      (item.type === 'created' ||
        item.type === 'evaluated' ||
        item.type === 'asset-generated' ||
        item.type === 'stage-changed' ||
        item.type === 'note-added' ||
        item.type === 'migrated') &&
      typeof item.at === 'string' &&
      typeof item.label === 'string'
    )
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
  return (
    a.coverNote === b.coverNote &&
    (a.callScript ?? '') === (b.callScript ?? '') &&
    (a.followUpNote ?? '') === (b.followUpNote ?? '') &&
    a.outreachBlurb === b.outreachBlurb &&
    sameStringArray(a.resumeBullets, b.resumeBullets) &&
    sameStringArray(a.interviewPrompts, b.interviewPrompts)
  )
}

function sameDossierEvaluation(a: DossierEvaluation, b: DossierEvaluation): boolean {
  return (
    a.fitScore === b.fitScore &&
    a.recommendation === b.recommendation &&
    sameStringArray(a.reasonsToPursue, b.reasonsToPursue) &&
    sameStringArray(a.reasonsToAvoid, b.reasonsToAvoid) &&
    sameStringArray(a.riskFlags, b.riskFlags) &&
    sameStringArray(a.confidenceGaps, b.confidenceGaps)
  )
}

function upsertTimelineEvent(
  timeline: DossierTimelineEvent[],
  type: DossierTimelineEvent['type'],
  label: string,
  at: string,
): DossierTimelineEvent[] {
  const existingIndex = timeline.findIndex(event => event.type === type)
  const nextEvent: DossierTimelineEvent =
    existingIndex >= 0 ? { ...timeline[existingIndex], label, at } : { id: createId(), type, label, at }

  if (existingIndex < 0) {
    return [nextEvent, ...timeline]
  }

  return timeline.map((event, index) => (index === existingIndex ? nextEvent : event))
}

function normalizeDossier(value: unknown): OpportunityDossier | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.company !== 'string' ||
    typeof value.role !== 'string' ||
    typeof value.location !== 'string' ||
    !isRecord(value.source) ||
    typeof value.salaryText !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.stage !== 'string' ||
    typeof value.nextAction !== 'string' ||
    typeof value.due !== 'string' ||
    typeof value.notes !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
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
    strengths: ['AI automation projects', 'computer engineering coursework', 'personal training and coaching'],
    urgencyMode: 'urgent-active-search',
    lanes: ['cash-now', 'engineering', 'trainer'],
    payFloors: {
      'cash-now': 18,
      engineering: TARGET_PROFILE.payFloor,
      trainer: 18,
    },
    availability: 'Flexible ASAP',
    resumePacket: {
      baseBullets: [
        'Built practical AI automation tools for operations and personal productivity.',
        'Comfortable with customer-facing work, fast follow-up, and hands-on problem solving.',
        'Personal training background with coaching, accountability, and client communication.',
      ],
      workHistory: [],
      projectProof: [],
      trainerPitch:
        'I help clients build realistic strength, consistency, and confidence while growing a local and online coaching book.',
      engineeringPitch:
        'I build practical AI, automation, and full-stack tools and want entry engineering, IT, data, and automation roles where I can ship quickly.',
      coverTemplates: {
        'cash-now': 'I am available flexible ASAP in Fort Myers and can move quickly for part-time work at $18/hr+.',
        engineering:
          'I bring hands-on AI automation and software project experience, with a bias for useful systems and fast learning.',
        trainer:
          'I bring coaching energy, consistency, and client-first communication to help people start and stick with training.',
      },
      commonAnswers: {
        availability: 'Flexible ASAP',
        authorizedToWork: 'Yes',
        desiredPay: '$18/hr+ for cash-now roles',
      },
    },
    links: {},
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
      lanes: Array.isArray(parsed.lanes)
        ? (normalizeStringArray(parsed.lanes) as CareerLane[])
        : defaultCareerProfile().lanes,
      payFloors: isRecord(parsed.payFloors)
        ? (parsed.payFloors as Record<CareerLane, number>)
        : defaultCareerProfile().payFloors,
      availability: typeof parsed.availability === 'string' ? parsed.availability : defaultCareerProfile().availability,
      resumePacket: isRecord(parsed.resumePacket)
        ? {
            ...defaultCareerProfile().resumePacket!,
            ...parsed.resumePacket,
            baseBullets: normalizeStringArray(
              parsed.resumePacket.baseBullets,
              defaultCareerProfile().resumePacket!.baseBullets,
            ),
            workHistory: normalizeStringArray(parsed.resumePacket.workHistory),
            projectProof: normalizeStringArray(parsed.resumePacket.projectProof),
            coverTemplates: isRecord(parsed.resumePacket.coverTemplates)
              ? { ...defaultCareerProfile().resumePacket!.coverTemplates, ...parsed.resumePacket.coverTemplates }
              : defaultCareerProfile().resumePacket!.coverTemplates,
            commonAnswers: isRecord(parsed.resumePacket.commonAnswers)
              ? {
                  ...defaultCareerProfile().resumePacket!.commonAnswers,
                  ...normalizeStringRecord(parsed.resumePacket.commonAnswers),
                }
              : defaultCareerProfile().resumePacket!.commonAnswers,
          }
        : defaultCareerProfile().resumePacket,
      links: normalizeStringRecord(parsed.links, defaultCareerProfile().links),
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

const GROWTH_PLATFORMS: GrowthPlatform[] = ['tiktok', 'instagram', 'youtube']

function platformLabel(platform: GrowthPlatform): string {
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'instagram') return 'Instagram Reels'
  return 'YouTube Shorts'
}

function normalizeGrowthPlatform(value: unknown): GrowthPlatform {
  return value === 'instagram' || value === 'youtube' || value === 'tiktok' ? value : 'tiktok'
}

function normalizeGrowthMetricSet(value: unknown): GrowthMetricSet {
  const source = isRecord(value) ? value : {}
  return {
    views: Math.max(0, Number(source.views) || 0),
    likes: Math.max(0, Number(source.likes) || 0),
    comments: Math.max(0, Number(source.comments) || 0),
    shares: Math.max(0, Number(source.shares) || 0),
    saves: Math.max(0, Number(source.saves) || 0),
    watchRetention: typeof source.watchRetention === 'number' ? Math.max(0, source.watchRetention) : null,
    followerDelta: typeof source.followerDelta === 'number' ? source.followerDelta : null,
    leadSignal: typeof source.leadSignal === 'number' ? Math.max(0, source.leadSignal) : null,
  }
}

function normalizeRecipeStatus(value: unknown): GrowthRecipeStatus {
  return value === 'winning' || value === 'promising' || value === 'stale' || value === 'failed' || value === 'testing'
    ? value
    : 'testing'
}

function normalizeIdeaStatus(value: unknown): GrowthIdeaStatus {
  return value === 'scripted' ||
    value === 'recorded' ||
    value === 'packaged' ||
    value === 'posted' ||
    value === 'archived' ||
    value === 'idea'
    ? value
    : 'idea'
}

function normalizePostApprovalState(value: unknown): GrowthPostApprovalState {
  return value === 'needs-video' ||
    value === 'ready-for-approval' ||
    value === 'approved' ||
    value === 'queued' ||
    value === 'posted' ||
    value === 'blocked' ||
    value === 'draft'
    ? value
    : 'draft'
}

function clampOneToFive(value: unknown, fallback: 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  const number = Math.round(Number(value))
  if (number >= 1 && number <= 5) return number as 1 | 2 | 3 | 4 | 5
  return fallback
}

export function growthMetricScore(metrics: GrowthMetricSet): number {
  if (metrics.views <= 0) return 0
  const likeRate = metrics.likes / metrics.views
  const commentRate = metrics.comments / metrics.views
  const shareRate = metrics.shares / metrics.views
  const saveRate = metrics.saves / metrics.views
  const retention = typeof metrics.watchRetention === 'number' ? metrics.watchRetention / 100 : 0
  const followRate = typeof metrics.followerDelta === 'number' ? Math.max(0, metrics.followerDelta) / metrics.views : 0
  const lead = Math.min(8, metrics.leadSignal ?? 0)
  return Math.round(
    likeRate * 450 +
      commentRate * 1100 +
      shareRate * 6800 +
      saveRate * 6200 +
      followRate * 11000 +
      retention * 80 +
      lead * 8,
  )
}

export function dedupeViralVideos(videos: ViralVideo[]): ViralVideo[] {
  const seen = new Set<string>()
  return videos.filter(video => {
    const urlKey = normalizeVideoUrl(video.url)
    const hookKey = normalizeText(video.hook).slice(0, 88)
    const creatorKey = normalizeText(video.creatorHandle)
    const keys = [
      `${video.platform}:url:${urlKey}`,
      `${video.platform}:hook:${creatorKey}:${hookKey}`,
      `${video.platform}:topic:${normalizeText(video.topic)}:${hookKey.slice(0, 48)}`,
    ].filter(key => !key.endsWith(':'))
    if (keys.some(key => seen.has(key))) return false
    keys.forEach(key => seen.add(key))
    return true
  })
}

export function defaultGrowthOpsState(): GrowthOpsState {
  const now = new Date().toISOString()
  const creatorWatchlist: CreatorWatchlist[] = [
    {
      id: 'creator-hussein',
      platform: 'tiktok',
      handle: 'hussein',
      displayName: 'Hussein',
      niche: 'fitness transformation and creator growth',
      rationale: 'Strong personal brand model for fitness storytelling and community pull.',
      source: 'watchlist',
    },
    {
      id: 'creator-alex-eubank',
      platform: 'instagram',
      handle: 'alex_eubank15',
      displayName: 'Alex Eubank',
      niche: 'aesthetic lifting and lifestyle fitness',
      rationale: 'Useful benchmark for physique-driven hooks, visual identity, and audience loyalty.',
      source: 'watchlist',
    },
    {
      id: 'creator-jeff-nippard',
      platform: 'youtube',
      handle: 'JeffNippard',
      displayName: 'Jeff Nippard',
      niche: 'science-based hypertrophy',
      rationale: 'Science-based lifting authority with repeatable evidence plus gym-demo formats.',
      source: 'watchlist',
    },
  ]

  const contentRecipes: ContentRecipe[] = [
    {
      id: 'recipe-myth-demo-cta',
      name: 'Myth-bust, quick demo, coaching CTA',
      hookFormula: 'Most lifters get {lift cue} wrong because {simple science reason}.',
      visualFormat: 'Talking-head hook into one gym-floor demo and on-screen cue.',
      proofType: 'study-backed cue plus personal lifting demonstration',
      cta: 'Comment your lift or DM "coach" for a form check.',
      difficulty: 2,
      expectedUpside: 5,
      status: 'testing',
      topics: ['hypertrophy', 'form', 'science-based lifting'],
      baselineScore: 55,
      lastReviewedAt: now,
    },
    {
      id: 'recipe-beginner-fix',
      name: 'Beginner mistake, one fix, measurable result',
      hookFormula: 'If you are new to lifting, stop doing {mistake} and do this instead.',
      visualFormat: 'Before/after rep comparison with tight captions.',
      proofType: 'simple biomechanics and visible rep-quality change',
      cta: 'Save this before your next workout.',
      difficulty: 1,
      expectedUpside: 4,
      status: 'testing',
      topics: ['beginner strength', 'gym confidence', 'technique'],
      baselineScore: 45,
      lastReviewedAt: now,
    },
    {
      id: 'recipe-accountability',
      name: 'Accountability story into coaching lead',
      hookFormula: 'The reason you are not consistent is not discipline. It is {system gap}.',
      visualFormat: 'Walk-and-talk with workout clips and one checklist overlay.',
      proofType: 'personal progress and client-style accountability framework',
      cta: 'DM "plan" if you want a simple weekly structure.',
      difficulty: 3,
      expectedUpside: 4,
      status: 'testing',
      topics: ['accountability', 'online coaching', 'consistency'],
      baselineScore: 50,
      lastReviewedAt: now,
    },
  ]

  return {
    creatorWatchlist,
    viralVideos: [],
    contentRecipes,
    contentIdeas: [],
    postPackages: [],
    metricSnapshots: [],
  }
}

function normalizeCreatorWatchlist(value: unknown): CreatorWatchlist | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    platform: normalizeGrowthPlatform(value.platform),
    handle: typeof value.handle === 'string' ? value.handle : '',
    displayName: typeof value.displayName === 'string' ? value.displayName : '',
    niche: typeof value.niche === 'string' ? value.niche : '',
    rationale: typeof value.rationale === 'string' ? value.rationale : '',
    source:
      value.source === 'owned-analytics' ||
      value.source === 'manual-link' ||
      value.source === 'approved-provider' ||
      value.source === 'watchlist'
        ? value.source
        : 'watchlist',
    lastCheckedAt: typeof value.lastCheckedAt === 'string' ? value.lastCheckedAt : undefined,
  }
}

function normalizeViralVideo(value: unknown): ViralVideo | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    platform: normalizeGrowthPlatform(value.platform),
    creatorId: typeof value.creatorId === 'string' ? value.creatorId : undefined,
    creatorHandle: typeof value.creatorHandle === 'string' ? value.creatorHandle : '',
    url: typeof value.url === 'string' ? value.url : '',
    hook: typeof value.hook === 'string' ? value.hook : '',
    topic: typeof value.topic === 'string' ? value.topic : '',
    format: typeof value.format === 'string' ? value.format : '',
    lengthSeconds: Math.max(0, Number(value.lengthSeconds) || 0),
    metrics: normalizeGrowthMetricSet(value.metrics),
    notes: typeof value.notes === 'string' ? value.notes : '',
    source:
      value.source === 'owned-analytics' ||
      value.source === 'watchlist' ||
      value.source === 'approved-provider' ||
      value.source === 'manual-link'
        ? value.source
        : 'manual-link',
    capturedAt: normalizeTimestamp(value.capturedAt, new Date().toISOString()),
  }
}

function normalizeContentRecipe(value: unknown): ContentRecipe | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : '',
    hookFormula: typeof value.hookFormula === 'string' ? value.hookFormula : '',
    visualFormat: typeof value.visualFormat === 'string' ? value.visualFormat : '',
    proofType: typeof value.proofType === 'string' ? value.proofType : '',
    cta: typeof value.cta === 'string' ? value.cta : '',
    difficulty: clampOneToFive(value.difficulty, 2),
    expectedUpside: clampOneToFive(value.expectedUpside, 3),
    status: normalizeRecipeStatus(value.status),
    topics: normalizeStringArray(value.topics),
    baselineScore: Math.max(0, Number(value.baselineScore) || 0),
    lastReviewedAt: typeof value.lastReviewedAt === 'string' ? value.lastReviewedAt : undefined,
  }
}

function normalizeContentIdea(value: unknown): ContentIdea | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const platformVariants = isRecord(value.platformVariants) ? value.platformVariants : {}
  return {
    id: value.id,
    recipeId: typeof value.recipeId === 'string' ? value.recipeId : '',
    title: typeof value.title === 'string' ? value.title : '',
    scriptOutline: normalizeStringArray(value.scriptOutline),
    platformVariants: {
      tiktok: typeof platformVariants.tiktok === 'string' ? platformVariants.tiktok : '',
      instagram: typeof platformVariants.instagram === 'string' ? platformVariants.instagram : '',
      youtube: typeof platformVariants.youtube === 'string' ? platformVariants.youtube : '',
    },
    caption: typeof value.caption === 'string' ? value.caption : '',
    hashtags: normalizeStringArray(value.hashtags),
    cta: typeof value.cta === 'string' ? value.cta : '',
    status: normalizeIdeaStatus(value.status),
    makeToday: value.makeToday === true,
    createdAt: normalizeTimestamp(value.createdAt, new Date().toISOString()),
  }
}

function normalizePostPackage(value: unknown): PostPackage | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const variants = isRecord(value.platformVariants) ? value.platformVariants : {}
  const platformVariants = Object.fromEntries(
    GROWTH_PLATFORMS.map(platform => {
      const variant = isRecord(variants[platform]) ? variants[platform] : {}
      return [
        platform,
        {
          enabled: variant.enabled !== false,
          title: typeof variant.title === 'string' ? variant.title : '',
          caption: typeof variant.caption === 'string' ? variant.caption : '',
          scheduledAt: typeof variant.scheduledAt === 'string' ? variant.scheduledAt : '',
          remotePostId: typeof variant.remotePostId === 'string' ? variant.remotePostId : undefined,
        },
      ]
    }),
  ) as PostPackage['platformVariants']
  return {
    id: value.id,
    ideaId: typeof value.ideaId === 'string' ? value.ideaId : '',
    videoFile: typeof value.videoFile === 'string' ? value.videoFile : undefined,
    coverFile: typeof value.coverFile === 'string' ? value.coverFile : undefined,
    platformVariants,
    approvalState: normalizePostApprovalState(value.approvalState),
    validationErrors: normalizeStringArray(value.validationErrors),
    createdAt: normalizeTimestamp(value.createdAt, new Date().toISOString()),
    approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : undefined,
  }
}

function normalizeMetricSnapshot(value: unknown): PostMetricSnapshot | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    postPackageId: typeof value.postPackageId === 'string' ? value.postPackageId : '',
    platform: normalizeGrowthPlatform(value.platform),
    measuredAt: normalizeTimestamp(value.measuredAt, new Date().toISOString()),
    horizon: value.horizon === '1h' || value.horizon === '72h' || value.horizon === '7d' ? value.horizon : '24h',
    metrics: normalizeGrowthMetricSet(value.metrics),
  }
}

export function normalizeGrowthOpsState(value: unknown): GrowthOpsState {
  const fallback = defaultGrowthOpsState()
  if (!isRecord(value)) return fallback
  const creatorWatchlist = Array.isArray(value.creatorWatchlist)
    ? value.creatorWatchlist.map(normalizeCreatorWatchlist).filter((item): item is CreatorWatchlist => item != null)
    : fallback.creatorWatchlist
  const contentRecipes = Array.isArray(value.contentRecipes)
    ? value.contentRecipes.map(normalizeContentRecipe).filter((item): item is ContentRecipe => item != null)
    : fallback.contentRecipes
  return {
    creatorWatchlist: creatorWatchlist.length > 0 ? creatorWatchlist : fallback.creatorWatchlist,
    viralVideos: Array.isArray(value.viralVideos)
      ? dedupeViralVideos(value.viralVideos.map(normalizeViralVideo).filter((item): item is ViralVideo => item != null))
      : fallback.viralVideos,
    contentRecipes: contentRecipes.length > 0 ? contentRecipes : fallback.contentRecipes,
    contentIdeas: Array.isArray(value.contentIdeas)
      ? value.contentIdeas.map(normalizeContentIdea).filter((item): item is ContentIdea => item != null)
      : fallback.contentIdeas,
    postPackages: Array.isArray(value.postPackages)
      ? value.postPackages.map(normalizePostPackage).filter((item): item is PostPackage => item != null)
      : fallback.postPackages,
    metricSnapshots: Array.isArray(value.metricSnapshots)
      ? value.metricSnapshots.map(normalizeMetricSnapshot).filter((item): item is PostMetricSnapshot => item != null)
      : fallback.metricSnapshots,
  }
}

export function loadGrowthOpsState(): GrowthOpsState {
  if (typeof window === 'undefined') return defaultGrowthOpsState()
  try {
    const localRaw = localStorage.getItem(GROWTH_OPS_LOCAL_STORAGE_KEY)
    if (localRaw) return normalizeGrowthOpsState(JSON.parse(localRaw))

    const legacyRaw = localStorage.getItem(GROWTH_OPS_STORAGE_KEY)
    const migrated = localStorage.getItem(GROWTH_OPS_MIGRATED_KEY)
    if (legacyRaw && !migrated) {
      const normalized = normalizeGrowthOpsState(JSON.parse(legacyRaw))
      localStorage.setItem(GROWTH_OPS_LOCAL_STORAGE_KEY, JSON.stringify(normalized))
      localStorage.setItem(GROWTH_OPS_MIGRATED_KEY, new Date().toISOString())
      return normalized
    }

    if (legacyRaw) return normalizeGrowthOpsState(JSON.parse(legacyRaw))
    return defaultGrowthOpsState()
  } catch {
    return defaultGrowthOpsState()
  }
}

export function hasStoredGrowthOpsState(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!localStorage.getItem(GROWTH_OPS_LOCAL_STORAGE_KEY) || !!localStorage.getItem(GROWTH_OPS_STORAGE_KEY)
  } catch {
    return false
  }
}

export function saveGrowthOpsState(state: GrowthOpsState): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeGrowthOpsState(state)
  localStorage.setItem(GROWTH_OPS_LOCAL_STORAGE_KEY, JSON.stringify(normalized))
}

export function markGrowthOpsPendingUpload(state: GrowthOpsState): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeGrowthOpsState(state)
  localStorage.setItem(GROWTH_OPS_LOCAL_STORAGE_KEY, JSON.stringify(normalized))
  localStorage.setItem(GROWTH_OPS_PENDING_UPLOAD_KEY, '1')
}

export function hasPendingGrowthOpsUpload(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(GROWTH_OPS_PENDING_UPLOAD_KEY) === '1'
  } catch {
    return false
  }
}

export function clearPendingGrowthOpsUpload(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(GROWTH_OPS_PENDING_UPLOAD_KEY)
}

export function normalizeVideoUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    url.hash = ''
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|igsh|si$|feature$|share_|app$)/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    return `${url.hostname.replace(/^www\./, '')}${url.pathname}${url.search}`.toLowerCase().replace(/\/$/, '')
  } catch {
    return normalizeText(value)
  }
}

export function scoreContentRecipe(recipe: ContentRecipe, videos: ViralVideo[], snapshots: PostMetricSnapshot[] = []): number {
  const topicPattern = new RegExp(recipe.topics.map(topic => normalizeText(topic)).filter(Boolean).join('|') || recipe.id)
  const videoScores = videos
    .filter(video => topicPattern.test(normalizeText([video.topic, video.hook, video.notes].join(' '))))
    .map(video => growthMetricScore(video.metrics))
  const ownedScores = snapshots.map(snapshot => growthMetricScore(snapshot.metrics))
  const scores = [...videoScores, ...ownedScores]
  if (scores.length === 0) return recipe.baselineScore
  const best = Math.max(...scores)
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return Math.round(average * 0.6 + best * 0.4)
}

export function recipeStatusFromScore(score: number, baselineScore: number): GrowthRecipeStatus {
  if (score >= baselineScore + 35) return 'winning'
  if (score >= baselineScore + 12) return 'promising'
  if (score <= Math.max(10, baselineScore - 20)) return 'failed'
  return 'testing'
}

export function updateRecipeLearning(state: GrowthOpsState): GrowthOpsState {
  const now = new Date().toISOString()
  return {
    ...state,
    contentRecipes: state.contentRecipes.map(recipe => {
      const score = scoreContentRecipe(recipe, state.viralVideos, state.metricSnapshots)
      const status = recipeStatusFromScore(score, recipe.baselineScore)
      return {
        ...recipe,
        baselineScore: score,
        status: status === 'testing' && recipe.status === 'winning' ? 'promising' : status,
        lastReviewedAt: now,
      }
    }),
  }
}

export function generateDailyContentIdeas(state: GrowthOpsState, now = new Date()): ContentIdea[] {
  const learnedTopics = [
    ...state.viralVideos.flatMap(video => [video.topic, video.hook]),
    ...state.contentRecipes.flatMap(recipe => recipe.topics),
  ]
    .map(item => normalizeText(item).split(' ').slice(0, 4).join(' '))
    .filter(Boolean)
  const baseTopics = [
    'bench press shoulder pain fix',
    'squat depth myth tension',
    'science-based arm growth cue',
    'natural lifter recovery mistake',
    'beginner progressive overload system',
    'protein timing truth',
    'deadlift setup fix',
    'gym consistency system',
    'online coaching accountability',
    'lat pulldown cue',
  ]
  const topics = Array.from(new Set([...learnedTopics.slice(0, 4), ...baseTopics])).slice(0, 10)
  const recipes = (state.contentRecipes.length > 0 ? state.contentRecipes : defaultGrowthOpsState().contentRecipes)
    .slice()
    .sort((a, b) => b.baselineScore + b.expectedUpside * 12 - b.difficulty * 4 - (a.baselineScore + a.expectedUpside * 12 - a.difficulty * 4))
  const scored = topics.map((topic, index) => {
    const recipe = recipes[index % recipes.length]
    const title = `${topic}: ${recipe.name}`
    const shortTitle = truncate(title, 72)
    const idea: ContentIdea = {
      id: `idea-${now.toISOString().slice(0, 10)}-${index + 1}`,
      recipeId: recipe.id,
      title: shortTitle,
      scriptOutline: [
        recipe.hookFormula.replace('{lift cue}', topic).replace('{simple science reason}', 'your setup changes the target muscle'),
        `Show the wrong rep, then the corrected ${topic} cue.`,
        `Give the science in one sentence: ${recipe.proofType}.`,
        recipe.cta,
      ],
      platformVariants: {
        tiktok: `TikTok: fast hook in first second, gym demo before context, ${recipe.cta}`,
        instagram: `Reels: cover text with the mistake, saveable cue list, polished demo, ${recipe.cta}`,
        youtube: `Shorts: searchable one-problem title, immediate answer, clear retention loop, ${recipe.cta}`,
      },
      caption: `${shortTitle}. ${recipe.cta}`,
      hashtags: platformAwareHashtags(topic),
      cta: recipe.cta,
      status: 'idea',
      makeToday: false,
      createdAt: now.toISOString(),
    }
    return {
      idea,
      score: recipe.baselineScore + recipe.expectedUpside * 18 - recipe.difficulty * 7 + (index < 5 ? 8 : 0),
    }
  })
  const topIds = new Set(scored.slice().sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.idea.id))
  return scored.map(item => ({ ...item.idea, makeToday: topIds.has(item.idea.id) }))
}

function platformAwareHashtags(topic: string): string[] {
  const normalized = normalizeText(topic)
  const tags = ['sciencebasedlifting', 'fitnesscoach', 'strengthtraining']
  if (normalized.includes('beginner')) tags.push('beginnerfitness')
  if (normalized.includes('protein') || normalized.includes('recovery')) tags.push('naturalbodybuilding')
  if (normalized.includes('squat') || normalized.includes('deadlift') || normalized.includes('bench')) tags.push('formcheck')
  if (normalized.includes('coaching') || normalized.includes('accountability')) tags.push('onlinecoach')
  return Array.from(new Set(tags)).slice(0, 5)
}

export function createPostPackageFromIdea(idea: ContentIdea, scheduledAt = new Date().toISOString()): PostPackage {
  const platformVariants = Object.fromEntries(
    GROWTH_PLATFORMS.map(platform => [
      platform,
      {
        enabled: true,
        title: truncate(idea.title, platform === 'youtube' ? 100 : 80),
        caption: `${idea.platformVariants[platform] || idea.caption}\n\n${idea.hashtags.map(tag => `#${tag}`).join(' ')}`,
        scheduledAt,
      },
    ]),
  ) as PostPackage['platformVariants']
  const postPackage: PostPackage = {
    id: `post-${idea.id}`,
    ideaId: idea.id,
    platformVariants,
    approvalState: 'needs-video',
    validationErrors: [],
    createdAt: scheduledAt,
  }
  return validatePostPackage(postPackage)
}

export function validatePostPackage(postPackage: PostPackage): PostPackage {
  const errors: string[] = []
  if (!postPackage.videoFile?.trim()) errors.push('Attach a vertical video file before approval.')
  const enabledPlatforms = GROWTH_PLATFORMS.filter(platform => postPackage.platformVariants[platform]?.enabled)
  if (enabledPlatforms.length === 0) errors.push('Enable at least one publishing platform.')
  for (const platform of enabledPlatforms) {
    const variant = postPackage.platformVariants[platform]
    if (!variant.title.trim()) errors.push(`${platformLabel(platform)} needs a title.`)
    if (!variant.caption.trim()) errors.push(`${platformLabel(platform)} needs a caption.`)
    if (!variant.scheduledAt.trim()) errors.push(`${platformLabel(platform)} needs a scheduled time.`)
  }
  return {
    ...postPackage,
    validationErrors: errors,
    approvalState:
      errors.length > 0
        ? postPackage.videoFile?.trim()
          ? 'draft'
          : 'needs-video'
        : postPackage.approvalState === 'approved' || postPackage.approvalState === 'queued' || postPackage.approvalState === 'posted'
          ? postPackage.approvalState
          : 'ready-for-approval',
  }
}

export function approvePostPackage(postPackage: PostPackage): PostPackage {
  const validated = validatePostPackage(postPackage)
  if (validated.validationErrors.length > 0) {
    return { ...validated, approvalState: 'blocked' }
  }
  return { ...validated, approvalState: 'queued', approvedAt: new Date().toISOString() }
}

export function addManualViralVideo(state: GrowthOpsState, video: Omit<ViralVideo, 'id' | 'capturedAt' | 'source'>): GrowthOpsState {
  const nextVideo: ViralVideo = {
    ...video,
    id: `viral-${createId()}`,
    source: 'manual-link',
    capturedAt: new Date().toISOString(),
  }
  return updateRecipeLearning({
    ...state,
    viralVideos: dedupeViralVideos([nextVideo, ...state.viralVideos]),
  })
}

export function createEmptyAssets(): DossierAssetSet {
  return {
    resumeBullets: [],
    coverNote: '',
    outreachBlurb: '',
    interviewPrompts: [],
    callScript: '',
    followUpNote: '',
  }
}

function defaultDossier(
  sourceLabel: string,
  timelineLabel: string,
): Omit<OpportunityDossier, 'id' | 'createdAt' | 'updatedAt'> {
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

function buildCreatedDossier(
  base: Omit<OpportunityDossier, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): OpportunityDossier {
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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
    case 'sourcing':
      return 'applied'
    case 'applied':
      return 'interviewing'
    case 'interviewing':
      return 'offer'
    case 'offer':
      return 'archived'
    case 'archived':
      return 'archived'
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
  const bg = priority === 'high' ? 'var(--red-a12)' : priority === 'low' ? 'var(--bg-white-05)' : 'var(--blue-a12)'
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
  const lane = laneForLiveJob(job)
  return buildCreatedDossier({
    ...defaultDossier(job.source, 'Dossier created from live search'),
    company: job.company,
    role: job.title,
    location: job.location,
    lane,
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
    tags: uniqueStrings([job.category, job.jobType, 'live', lane]),
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
  const priority: JobPriority = recommendation === 'pursue' ? 'high' : recommendation === 'hold' ? 'medium' : 'low'

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
  return matches && matches.join('').length >= clean.length - 2 ? matches.join(' ') : clean
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

  const lane = laneForDossier(dossier)
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

  if (lane === 'cash-now') {
    const payFloor = profile.payFloors?.['cash-now'] ?? 18
    const availability = profile.availability ?? 'Flexible ASAP'
    const cashNowTemplate =
      profile.resumePacket?.coverTemplates?.['cash-now'] ||
      `I am available ${availability.toLowerCase()} in Fort Myers and can move quickly for part-time work at $${payFloor}/hr+.`
    nextAssets.coverNote = `${cashNowTemplate} I am interested in ${dossier.role} at ${dossier.company} and can apply or follow up today.`
    nextAssets.outreachBlurb = `Hi, I’m reaching out about ${dossier.role} at ${dossier.company}. I am available ${availability.toLowerCase()}, can start quickly, and I am looking for part-time work at $${payFloor}/hr+.`
    nextAssets.callScript = `Hi, I’m calling about ${dossier.role} at ${dossier.company}. I’m available ${availability.toLowerCase()} and can come in or apply today. Are you still hiring for this role, and what is the fastest way to be considered?`
    nextAssets.followUpNote = `Hi ${dossier.company} team, I applied or reached out today about ${dossier.role}. I’m available ${availability.toLowerCase()} in Fort Myers and interested in moving forward quickly for $${payFloor}/hr+ part-time work. Thank you.`
    nextAssets.interviewPrompts = [
      `What shift times are open this week for ${dossier.role}?`,
      `What is the fastest next step: online application, phone screen, or in-person visit?`,
      `Does the role meet or beat $${payFloor}/hr, and how soon could training start?`,
    ]
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
  const recencyScore = job.publishedAt
    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(job.publishedAt).getTime()) / 86400000))
    : 8
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
  const ageDays = job.publishedAt ? Math.floor((Date.now() - new Date(job.publishedAt).getTime()) / 86400000) : 0

  return (
    recommendation.mode !== 'direct' &&
    (salary == null || salary >= minimumHourlyRate + BROWSER_REVIEW_MIN_SALARY_BUFFER) &&
    ageDays >= 0 &&
    ageDays <= BROWSER_REVIEW_MAX_AGE_DAYS &&
    BROWSER_REVIEW_KEYWORDS.test(title)
  )
}

export function normalizeTags(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
}

export function buildSearchQuery(query: string, mode: WorkMode): string {
  const base = query.trim()
  const defaultQuery = 'AI automation data annotation entry level intern remote'
  const modeTokens: Record<WorkMode, string> = {
    'remote-first': 'remote',
    'hybrid-ok': 'remote hybrid',
    'local-fallback': 'Fort Myers 33905',
  }
  const q = base || defaultQuery
  return q.toLowerCase().includes('remote') || q.toLowerCase().includes('hybrid')
    ? q
    : `${q} ${modeTokens[mode]}`.trim()
}

export function laneForLiveJob(job: LiveJob): CareerLane {
  const haystack = normalizeText(
    [job.title, job.company, job.category, job.jobType, job.location, job.summary].join(' '),
  )
  if (/trainer|fitness|gym|coach|personal training|wellness/.test(haystack)) return 'trainer'
  if (
    /fort myers|33905|part time|part-time|server|retail|warehouse|front desk|evening|weekend|hiring immediately/.test(
      haystack,
    ) &&
    !/software engineer|machine learning|developer internship/.test(haystack)
  ) {
    return 'cash-now'
  }
  return 'engineering'
}

export function laneForDossier(dossier: OpportunityDossier): CareerLane {
  if (dossier.lane) return dossier.lane
  const tags = dossier.tags.map(tag => normalizeText(tag))
  if (tags.includes('cash-now')) return 'cash-now'
  if (tags.includes('trainer')) return 'trainer'
  const haystack = normalizeText(
    [dossier.role, dossier.company, dossier.location, dossier.summary, dossier.notes].join(' '),
  )
  if (/trainer|fitness|gym|coach|personal training|online coaching/.test(haystack)) return 'trainer'
  if (/fort myers|part time|part-time|server|retail|warehouse|front desk|evening|weekend/.test(haystack))
    return 'cash-now'
  return 'engineering'
}

export function buildCashNowSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${query} jobs apply Fort Myers FL`)}`
}

export function buildIndeedSearchUrlFromText(query: string, location: string): string {
  const params = new URLSearchParams({
    q: query,
    l: location,
    fromage: '14',
  })
  return `https://www.indeed.com/jobs?${params.toString()}`
}

export function buildLinkedInSearchUrlFromText(query: string, location: string): string {
  const params = new URLSearchParams({
    keywords: query,
    location,
    f_TPR: 'r604800',
  })
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`
}

export function buildCraigslistSearchUrlFromText(query: string): string {
  return `https://fortmyers.craigslist.org/search/jjj?query=${encodeURIComponent(query)}`
}

export function buildCompanyCareerSearchUrl(company: string): string {
  return buildGoogleSearchUrlFromText(`${company} careers Fort Myers part time apply`, 'Fort Myers FL')
}

export function buildLaneBrowserSearches(lane: CareerLane): Array<{ label: string; url: string }> {
  if (lane === 'cash-now') {
    return [
      { label: CASH_NOW_QUERIES[0], url: buildCashNowSearchUrl(CASH_NOW_QUERIES[0]) },
      { label: `Indeed: ${CASH_NOW_QUERIES[0]}`, url: buildIndeedSearchUrlFromText('part time $18', 'Fort Myers, FL') },
      {
        label: 'Google Jobs: hiring immediately',
        url: buildCashNowSearchUrl('hiring immediately part time Fort Myers $18'),
      },
      {
        label: `Indeed: ${CASH_NOW_QUERIES[4]}`,
        url: buildIndeedSearchUrlFromText('server part time', 'Fort Myers, FL'),
      },
      {
        label: `Indeed: ${CASH_NOW_QUERIES[5]}`,
        url: buildIndeedSearchUrlFromText('warehouse part time', 'Fort Myers, FL'),
      },
      { label: CASH_NOW_QUERIES[3], url: buildCashNowSearchUrl(CASH_NOW_QUERIES[3]) },
      {
        label: `Indeed: ${CASH_NOW_QUERIES[8]}`,
        url: buildIndeedSearchUrlFromText('hotel front desk part time', 'Fort Myers, FL'),
      },
      {
        label: `Indeed: ${CASH_NOW_QUERIES[10]}`,
        url: buildIndeedSearchUrlFromText('grocery part time', 'Fort Myers, FL'),
      },
      {
        label: `Craigslist: ${CASH_NOW_QUERIES[1]}`,
        url: buildCraigslistSearchUrlFromText('evening part time'),
      },
      {
        label: `LinkedIn: ${CASH_NOW_QUERIES[7]}`,
        url: buildLinkedInSearchUrlFromText('IT support part time', 'Fort Myers, FL'),
      },
      {
        label: 'Company pages: Fort Myers fast hire',
        url: buildGoogleSearchUrlFromText('Fort Myers part time hiring immediately apply', 'Fort Myers FL'),
      },
      ...CASH_NOW_COMPANY_TARGETS.map(company => ({
        label: `Company: ${company}`,
        url: buildCompanyCareerSearchUrl(company),
      })),
      ...CASH_NOW_QUERIES.slice(1).map(query => ({ label: query, url: buildCashNowSearchUrl(query) })),
    ]
  }
  if (lane === 'trainer') {
    return [
      { label: 'trainer jobs Fort Myers', url: buildGoogleSearchUrlFromText('personal trainer jobs', 'Fort Myers FL') },
      {
        label: 'Indeed: trainer jobs Fort Myers',
        url: buildIndeedSearchUrlFromText('personal trainer', 'Fort Myers, FL'),
      },
      {
        label: 'LinkedIn: trainer jobs Fort Myers',
        url: buildLinkedInSearchUrlFromText('personal trainer', 'Fort Myers, FL'),
      },
      {
        label: 'gym front desk trainer Fort Myers',
        url: buildGoogleSearchUrlFromText('gym front desk trainer', 'Fort Myers FL'),
      },
      {
        label: 'online coaching leads',
        url: buildGoogleSearchUrlFromText('online fitness coaching clients content ideas', 'remote'),
      },
    ]
  }
  return [
    {
      label: 'AI automation entry level',
      url: buildGoogleSearchUrlFromText('AI automation entry level intern', 'Remote'),
    },
    {
      label: 'LinkedIn: AI automation intern',
      url: buildLinkedInSearchUrlFromText('AI automation intern entry level', 'United States'),
    },
    {
      label: 'IT support part time Fort Myers',
      url: buildGoogleSearchUrlFromText('IT support part time', 'Fort Myers FL'),
    },
    {
      label: 'Indeed: IT support part time',
      url: buildIndeedSearchUrlFromText('IT support part time', 'Fort Myers, FL'),
    },
    {
      label: 'data annotation remote',
      url: buildGoogleSearchUrlFromText('data annotation remote entry level', 'Remote'),
    },
    {
      label: 'LinkedIn: data annotation remote',
      url: buildLinkedInSearchUrlFromText('data annotation remote entry level', 'United States'),
    },
  ]
}

export function buildCashNowAnalysis(job: LiveJob, feedback?: JobFeedback): JobAnalysis {
  const base = buildJobAnalysis(job, 18, feedback)
  const haystack = normalizeText(
    [job.title, job.company, job.category, job.jobType, job.location, job.summary, job.salary ?? ''].join(' '),
  )
  const rate = estimateHourlyRate(job.salary)
  let score = base.score
  const reasons = [...base.reasons]
  const signals = [...base.signals]

  if (/fort myers|33905|cape coral|lehigh acres/.test(haystack)) {
    score += 34
    signals.push('Local')
    reasons.push('Local to Fort Myers area')
  }
  if (/part time|part-time|evening|weekend|flexible|hiring immediately|immediate hire/.test(haystack)) {
    score += 28
    signals.push('Fast cash')
    reasons.push('Schedule or fast-hire language fits cash-now mode')
  }
  if (rate != null && rate >= 18) {
    score += 24
    signals.push('Meets $18/hr')
    reasons.push('Meets cash-now pay floor')
  }
  if (/full time only|full-time only|senior|principal|clearance/.test(haystack)) {
    score -= 30
    reasons.push('Likely slower or less flexible')
  }
  if (!/remote|fort myers|33905|cape coral|lehigh acres/.test(haystack)) {
    score -= 16
    reasons.push('Commute/location unclear')
  }

  return {
    ...base,
    score,
    rate,
    reasons: uniqueStrings(reasons),
    signals: uniqueStrings(signals),
  }
}

export function rankCashNowJobCards(jobs: LiveJob[], feedback: Record<string, JobFeedback> = {}): RankedJobCard[] {
  const grouped = new Map<string, RankedJobCard>()
  for (const job of jobs) {
    const analysis = buildCashNowAnalysis(job, feedback[jobKey(job)])
    const recommendation = recommendApplication(job)
    const key = analysis.key
    const card = { job, analysis, recommendation }
    const existing = grouped.get(key)
    if (!existing || card.analysis.score > existing.analysis.score) grouped.set(key, card)
  }
  return [...grouped.values()].sort((a, b) => b.analysis.score - a.analysis.score)
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

  const values = numbers
    .map(token => {
      const clean = token.replace('$', '')
      const isK = clean.endsWith('k')
      const raw = Number.parseFloat(clean.replace('k', ''))
      if (Number.isNaN(raw)) return null
      return isK ? raw * 1000 : raw
    })
    .filter((value): value is number => value != null)

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
