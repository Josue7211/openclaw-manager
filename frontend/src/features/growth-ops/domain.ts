import type { CSSProperties } from 'react'
import type {
  ContentIdea,
  ContentRecipe,
  CreatorWatchlist,
  GrowthAnalyticsImportRow,
  GrowthApprovalAuditEvent,
  GrowthCalendarSlot,
  GrowthCalendarSlotState,
  GrowthChecklistItem,
  GrowthConnectorStatus,
  GrowthEvidenceRow,
  GrowthIdeaStatus,
  GrowthMetricSet,
  GrowthOpsState,
  GrowthPlatform,
  GrowthPostApprovalState,
  GrowthQuarantinedAnalyticsRow,
  GrowthSignalSource,
  GrowthSourceConfidence,
  GrowthRecipeRecommendation,
  GrowthRecipeStatus,
  PostMetricSnapshot,
  PostPackage,
  ViralVideo,
} from './types'

export const GROWTH_PLATFORMS: GrowthPlatform[] = ['tiktok', 'instagram', 'youtube']
export const GROWTH_OPS_STORAGE_KEY = 'career-ops-growth-v1'
export const GROWTH_OPS_LOCAL_STORAGE_KEY = 'growth-ops-v2_5-local-state'
export const GROWTH_OPS_MIGRATED_KEY = 'growth-ops-v2_5-migrated-from-career-ops-growth-v1'
export const GROWTH_OPS_PENDING_UPLOAD_KEY = 'growth-ops-v2_5-pending-upload'
export const GROWTH_SECRET_SERVICES = ['social.tiktok', 'social.instagram', 'social.youtube'] as const

const FALLBACK_TIMESTAMP = '1970-01-01T00:00:00.000Z'

export const PLATFORM_LABEL: Record<GrowthPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Reels',
  youtube: 'Shorts',
}

export const REQUIRED_SCOPES: Record<GrowthPlatform, string[]> = {
  tiktok: ['video.list', 'user.info.basic', 'analytics.read'],
  instagram: ['instagram_basic', 'instagram_manage_insights', 'pages_show_list'],
  youtube: ['youtube.readonly', 'yt-analytics.readonly'],
}

export function createGrowthId(prefix = 'growth'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function truncate(text: string, max = 180): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const end = clean.charAt(max) === ' ' ? max : clean.slice(0, max).lastIndexOf(' ')
  return `${clean.slice(0, end > 0 ? end : max).trim()}...`
}

export function badgeStyle(kind: 'sourcing' | 'applied' | 'interviewing' | 'offer' | 'archived'): CSSProperties {
  const colors = {
    sourcing: 'var(--blue)',
    applied: 'var(--purple)',
    interviewing: 'var(--secondary)',
    offer: 'var(--green)',
    archived: 'var(--text-muted)',
  }
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    color: colors[kind],
    background: 'var(--bg-white-05)',
    padding: '3px 7px',
    fontSize: '11px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback
  const normalized = value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : fallback
}

function normalizeTimestamp(value: unknown, fallback = FALLBACK_TIMESTAMP): string {
  if (typeof value !== 'string') return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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
    value === 'needs-video' ||
    value === 'ready-for-approval' ||
    value === 'queued' ||
    value === 'recorded' ||
    value === 'packaged' ||
    value === 'posted' ||
    value === 'archived' ||
    value === 'idea'
    ? value
    : 'idea'
}

function normalizeCalendarSlotState(value: unknown): GrowthCalendarSlotState {
  return value === 'scripted' || value === 'needs-video' || value === 'ready-for-approval' || value === 'queued'
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

function normalizeRecipeRecommendation(value: unknown): GrowthRecipeRecommendation {
  return value === 'double-down' || value === 'remix' || value === 'pause' || value === 'test' ? value : 'test'
}

function normalizeSource(value: unknown, fallback: GrowthSignalSource = 'owned-analytics'): GrowthSignalSource {
  return value === 'owned-analytics' || value === 'watchlist' || value === 'manual-link' || value === 'approved-provider' ? value : fallback
}

function normalizeConfidence(value: unknown, fallback: GrowthSourceConfidence = 'medium'): GrowthSourceConfidence {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback
}

function normalizeHorizon(value: unknown): GrowthAnalyticsImportRow['horizon'] {
  return value === '1h' || value === '72h' || value === '7d' || value === '24h' ? value : '24h'
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

export function defaultGrowthOpsState(): GrowthOpsState {
  const now = new Date().toISOString()
  const creatorWatchlist: CreatorWatchlist[] = [
    {
      id: 'creator-hussein',
      platform: 'tiktok',
      handle: 'hussein',
      displayName: 'Hussein',
      niche: 'fitness transformation and creator growth',
      rationale: 'Seed watchlist only. Real analytics require manual import or a read-only connector.',
      source: 'watchlist',
    },
    {
      id: 'creator-alex-eubank',
      platform: 'instagram',
      handle: 'alex_eubank15',
      displayName: 'Alex Eubank',
      niche: 'aesthetic lifting and lifestyle fitness',
      rationale: 'Seed watchlist only. Use manual links or connector metadata before learning from this creator.',
      source: 'watchlist',
    },
    {
      id: 'creator-jeff-nippard',
      platform: 'youtube',
      handle: 'JeffNippard',
      displayName: 'Jeff Nippard',
      niche: 'science-based hypertrophy',
      rationale: 'Seed watchlist only. Existing public/owned metrics must be imported before scoring.',
      source: 'watchlist',
    },
  ]
  const platformScores = { tiktok: 0, instagram: 0, youtube: 0 }
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
      platformScores,
      recommendation: 'test',
      recommendationReason: 'No imported owned analytics yet.',
      recommendationEvidence: [],
      topicFatigue: false,
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
      platformScores,
      recommendation: 'test',
      recommendationReason: 'No imported owned analytics yet.',
      recommendationEvidence: [],
      topicFatigue: false,
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
      platformScores,
      recommendation: 'test',
      recommendationReason: 'No imported owned analytics yet.',
      recommendationEvidence: [],
      topicFatigue: false,
      lastReviewedAt: now,
    },
  ]
  return { creatorWatchlist, viralVideos: [], contentRecipes, contentIdeas: [], postPackages: [], metricSnapshots: [], quarantinedAnalyticsRows: [] }
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
    source: normalizeSource(value.source, 'manual-link'),
    sourceConfidence: normalizeConfidence(value.sourceConfidence, 'medium'),
    capturedAt: normalizeTimestamp(value.capturedAt, new Date().toISOString()),
  }
}

function normalizeContentRecipe(value: unknown): ContentRecipe | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const rawPlatformScores = isRecord(value.platformScores) ? value.platformScores : {}
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
    platformScores: {
      tiktok: Math.max(0, Number(rawPlatformScores.tiktok) || 0),
      instagram: Math.max(0, Number(rawPlatformScores.instagram) || 0),
      youtube: Math.max(0, Number(rawPlatformScores.youtube) || 0),
    },
    recommendation: normalizeRecipeRecommendation(value.recommendation),
    recommendationReason: typeof value.recommendationReason === 'string' ? value.recommendationReason : '',
    recommendationEvidence: Array.isArray(value.recommendationEvidence)
      ? value.recommendationEvidence
          .filter(isRecord)
          .map(item => ({
            id: typeof item.id === 'string' ? item.id : createGrowthId('evidence'),
            source: normalizeSource(item.source, 'owned-analytics'),
            platform: normalizeGrowthPlatform(item.platform),
            summary: typeof item.summary === 'string' ? item.summary : '',
            score: Math.max(0, Number(item.score) || 0),
            measuredAt: typeof item.measuredAt === 'string' ? item.measuredAt : undefined,
            url: typeof item.url === 'string' ? item.url : undefined,
          }))
          .filter(item => item.summary.trim())
      : [],
    topicFatigue: value.topicFatigue === true,
    lastReviewedAt: typeof value.lastReviewedAt === 'string' ? value.lastReviewedAt : undefined,
  }
}

function normalizeCalendarSlot(value: unknown): GrowthCalendarSlot | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    date: typeof value.date === 'string' ? value.date : new Date().toISOString().slice(0, 10),
    platform: normalizeGrowthPlatform(value.platform),
    state: normalizeCalendarSlotState(value.state),
    ideaId: typeof value.ideaId === 'string' ? value.ideaId : undefined,
    postPackageId: typeof value.postPackageId === 'string' ? value.postPackageId : undefined,
    title: typeof value.title === 'string' ? value.title : '',
    batchRecording: value.batchRecording === true,
    order: Math.max(0, Number(value.order) || 0),
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
    plannedSlots: Array.isArray(value.plannedSlots)
      ? value.plannedSlots.map(normalizeCalendarSlot).filter((item): item is GrowthCalendarSlot => item != null)
      : [],
    createdAt: normalizeTimestamp(value.createdAt, new Date().toISOString()),
  }
}

function normalizeChecklist(value: unknown, fallback: string[], prefix: string): GrowthChecklistItem[] {
  if (!Array.isArray(value)) {
    return fallback.map((label, index) => ({ id: `${prefix}-${index + 1}`, label, done: false }))
  }
  const normalized = value
    .filter(isRecord)
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `${prefix}-${index + 1}`,
      label: typeof item.label === 'string' ? item.label : '',
      done: item.done === true,
    }))
    .filter(item => item.label.trim())
  return normalized.length > 0 ? normalized : fallback.map((label, index) => ({ id: `${prefix}-${index + 1}`, label, done: false }))
}

function defaultScriptDraft(value: Record<string, unknown>): string {
  if (typeof value.scriptDraft === 'string' && value.scriptDraft.trim()) return value.scriptDraft
  if (typeof value.ideaId === 'string') return `Hook:\n\nDemo:\n\nProof:\n\nCTA:`
  return ''
}

function normalizeApprovalAudit(value: unknown): GrowthApprovalAuditEvent[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : createGrowthId('audit'),
      event:
        item.event === 'approved' || item.event === 'queued' || item.event === 'blocked' || item.event === 'validated'
          ? item.event
          : 'validated',
      actor: item.actor === 'local-user' ? 'local-user' : 'system',
      at: normalizeTimestamp(item.at, new Date().toISOString()),
      notes: typeof item.notes === 'string' ? item.notes : '',
    }))
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
  const coverTitleVariants = normalizeStringArray(value.coverTitleVariants)
  return {
    id: value.id,
    ideaId: typeof value.ideaId === 'string' ? value.ideaId : '',
    videoFile: typeof value.videoFile === 'string' ? value.videoFile : undefined,
    coverFile: typeof value.coverFile === 'string' ? value.coverFile : undefined,
    scriptDraft: defaultScriptDraft(value),
    shotList: normalizeChecklist(value.shotList, ['Talking hook', 'Wrong rep', 'Corrected rep', 'CTA clip'], 'shot'),
    brollChecklist: normalizeChecklist(value.brollChecklist, ['Phone tripod setup', 'Close-up cue', 'Cover frame'], 'broll'),
    coverTitleVariants: coverTitleVariants.length > 0 ? coverTitleVariants : Object.values(platformVariants).map(item => item.title).filter(Boolean).slice(0, 3),
    platformVariants,
    approvalState: normalizePostApprovalState(value.approvalState),
    validationErrors: normalizeStringArray(value.validationErrors),
    approvalAudit: normalizeApprovalAudit(value.approvalAudit),
    createdAt: normalizeTimestamp(value.createdAt, new Date().toISOString()),
    approvedAt: typeof value.approvedAt === 'string' ? value.approvedAt : undefined,
    queuedAt: typeof value.queuedAt === 'string' ? value.queuedAt : undefined,
  }
}

function normalizeMetricSnapshot(value: unknown): PostMetricSnapshot | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    postPackageId: typeof value.postPackageId === 'string' ? value.postPackageId : '',
    ideaId: typeof value.ideaId === 'string' ? value.ideaId : undefined,
    recipeId: typeof value.recipeId === 'string' ? value.recipeId : undefined,
    topic: typeof value.topic === 'string' ? value.topic : undefined,
    platform: normalizeGrowthPlatform(value.platform),
    measuredAt: normalizeTimestamp(value.measuredAt, new Date().toISOString()),
    horizon: normalizeHorizon(value.horizon),
    metrics: normalizeGrowthMetricSet(value.metrics),
    source: normalizeSource(value.source, 'owned-analytics'),
    confidence: normalizeConfidence(value.confidence, 'medium'),
    evidenceSummary: typeof value.evidenceSummary === 'string' ? value.evidenceSummary : '',
  }
}

function normalizeQuarantinedAnalyticsRow(value: unknown): GrowthQuarantinedAnalyticsRow | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    raw: isRecord(value.raw) ? Object.fromEntries(Object.entries(value.raw).map(([key, item]) => [key, String(item ?? '')])) : {},
    platform: value.platform === 'instagram' || value.platform === 'youtube' || value.platform === 'tiktok' ? value.platform : undefined,
    source: normalizeSource(value.source, 'owned-analytics'),
    confidence: normalizeConfidence(value.confidence, 'low'),
    quarantineReason: typeof value.quarantineReason === 'string' ? value.quarantineReason : 'Missing attribution.',
    capturedAt: normalizeTimestamp(value.capturedAt, new Date().toISOString()),
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
    quarantinedAnalyticsRows: Array.isArray(value.quarantinedAnalyticsRows)
      ? value.quarantinedAnalyticsRows.map(normalizeQuarantinedAnalyticsRow).filter((item): item is GrowthQuarantinedAnalyticsRow => item != null)
      : fallback.quarantinedAnalyticsRows,
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
  localStorage.setItem(GROWTH_OPS_LOCAL_STORAGE_KEY, JSON.stringify(normalizeGrowthOpsState(state)))
}

export function markGrowthOpsPendingUpload(state: GrowthOpsState): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GROWTH_OPS_LOCAL_STORAGE_KEY, JSON.stringify(normalizeGrowthOpsState(state)))
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
      if (/^(utm_|fbclid|gclid|igsh|si$|feature$|share_|app$)/i.test(key)) url.searchParams.delete(key)
    }
    return `${url.hostname.replace(/^www\./, '')}${url.pathname}${url.search}`.toLowerCase().replace(/\/$/, '')
  } catch {
    return normalizeText(value)
  }
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

function packageById(state: GrowthOpsState, id: string): PostPackage | undefined {
  return state.postPackages.find(postPackage => postPackage.id === id)
}

function ideaById(state: GrowthOpsState, id?: string): ContentIdea | undefined {
  return id ? state.contentIdeas.find(idea => idea.id === id) : undefined
}

function snapshotsForRecipe(recipe: ContentRecipe, state: GrowthOpsState): PostMetricSnapshot[] {
  return state.metricSnapshots.filter(snapshot => {
    if (snapshot.recipeId === recipe.id) return true
    const postPackage = packageById(state, snapshot.postPackageId)
    const idea = ideaById(state, snapshot.ideaId ?? postPackage?.ideaId)
    return idea?.recipeId === recipe.id
  })
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

function platformScoresForRecipe(recipe: ContentRecipe, state: GrowthOpsState): Record<GrowthPlatform, number> {
  const scoped = snapshotsForRecipe(recipe, state)
  return Object.fromEntries(
    GROWTH_PLATFORMS.map(platform => {
      const scores = scoped.filter(snapshot => snapshot.platform === platform).map(snapshot => growthMetricScore(snapshot.metrics))
      if (scores.length === 0) return [platform, recipe.platformScores?.[platform] ?? 0]
      return [platform, Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)]
    }),
  ) as Record<GrowthPlatform, number>
}

function topicUsageCount(recipe: ContentRecipe, state: GrowthOpsState): number {
  const topics = recipe.topics.map(topic => normalizeText(topic)).filter(Boolean)
  if (topics.length === 0) return 0
  return state.contentIdeas.filter(idea => topics.some(topic => normalizeText(idea.title).includes(topic))).length
}

function recommendRecipe(recipe: ContentRecipe, score: number, platformScores: Record<GrowthPlatform, number>, state: GrowthOpsState): {
  recommendation: GrowthRecipeRecommendation
  reason: string
} {
  const bestPlatform = GROWTH_PLATFORMS.slice().sort((left, right) => platformScores[right] - platformScores[left])[0]
  const bestScore = platformScores[bestPlatform]
  const usage = topicUsageCount(recipe, state)
  if (bestScore >= 120 || score >= recipe.baselineScore + 40) return { recommendation: 'double-down', reason: `${PLATFORM_LABEL[bestPlatform]} is carrying strongest score.` }
  if (usage >= 4 && score <= recipe.baselineScore + 5) return { recommendation: 'pause', reason: 'Topic fatigue risk from repeated recent ideas.' }
  if (bestScore >= 80 || score >= recipe.baselineScore + 15) return { recommendation: 'remix', reason: `${PLATFORM_LABEL[bestPlatform]} has enough signal for a new angle.` }
  return { recommendation: 'test', reason: 'Need more imported owned analytics before calling a winner.' }
}

function evidenceForRecipe(recipe: ContentRecipe, state: GrowthOpsState): GrowthEvidenceRow[] {
  const snapshotEvidence = snapshotsForRecipe(recipe, state)
    .map(snapshot => ({
      id: `evidence-${snapshot.id}`,
      source: snapshot.source,
      platform: snapshot.platform,
      summary: snapshot.evidenceSummary || `${PLATFORM_LABEL[snapshot.platform]} ${snapshot.horizon} snapshot scored ${growthMetricScore(snapshot.metrics)}.`,
      score: growthMetricScore(snapshot.metrics),
      measuredAt: snapshot.measuredAt,
    }))
  const topicPattern = new RegExp(recipe.topics.map(topic => normalizeText(topic)).filter(Boolean).join('|') || recipe.id)
  const videoEvidence = state.viralVideos
    .filter(video => topicPattern.test(normalizeText([video.topic, video.hook, video.notes].join(' '))))
    .map(video => ({
      id: `evidence-${video.id}`,
      source: video.source,
      platform: video.platform,
      summary: `${PLATFORM_LABEL[video.platform]} watchlist video: ${truncate(video.hook, 90)} (${growthMetricScore(video.metrics)} score).`,
      score: growthMetricScore(video.metrics),
      measuredAt: video.capturedAt,
      url: video.url,
    }))
  return [...snapshotEvidence, ...videoEvidence].sort((left, right) => right.score - left.score).slice(0, 6)
}

export function updateRecipeLearning(state: GrowthOpsState): GrowthOpsState {
  const now = new Date().toISOString()
  return {
    ...state,
    contentRecipes: state.contentRecipes.map(recipe => {
      const snapshots = snapshotsForRecipe(recipe, state)
      const score = scoreContentRecipe(recipe, state.viralVideos, snapshots)
      const status = recipeStatusFromScore(score, recipe.baselineScore)
      const platformScores = platformScoresForRecipe(recipe, state)
      const recommendation = recommendRecipe(recipe, score, platformScores, state)
      const topicFatigue = topicUsageCount(recipe, state) >= 4 && score <= recipe.baselineScore + 5
      return {
        ...recipe,
        baselineScore: score,
        platformScores,
        recommendation: recommendation.recommendation,
        recommendationReason: recommendation.reason,
        recommendationEvidence: evidenceForRecipe(recipe, state),
        topicFatigue,
        status: status === 'testing' && recipe.status === 'winning' ? 'promising' : status,
        lastReviewedAt: now,
      }
    }),
  }
}

export function generateDailyContentIdeas(state: GrowthOpsState, now = new Date()): ContentIdea[] {
  const learnedTopics = [...state.viralVideos.flatMap(video => [video.topic, video.hook]), ...state.contentRecipes.flatMap(recipe => recipe.topics)]
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
      status: index < 3 ? 'scripted' : 'idea',
      makeToday: false,
      plannedSlots: [],
      createdAt: now.toISOString(),
    }
    return { idea, score: recipe.baselineScore + recipe.expectedUpside * 18 - recipe.difficulty * 7 + (index < 5 ? 8 : 0) }
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

function dateForSlot(dayOffset: number, hour: number, base = new Date()): string {
  const date = new Date(base)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export function createPostPackageFromIdea(idea: ContentIdea, scheduledAt = new Date().toISOString()): PostPackage {
  const platformVariants = Object.fromEntries(
    GROWTH_PLATFORMS.map((platform, index) => [
      platform,
      {
        enabled: true,
        title: truncate(idea.title, platform === 'youtube' ? 100 : 80),
        caption: `${idea.platformVariants[platform] || idea.caption}\n\n${idea.hashtags.map(tag => `#${tag}`).join(' ')}`,
        scheduledAt: dateForSlot(index + 1, platform === 'tiktok' ? 12 : platform === 'instagram' ? 17 : 19, new Date(scheduledAt)),
      },
    ]),
  ) as PostPackage['platformVariants']
  const postPackage: PostPackage = {
    id: `post-${idea.id}`,
    ideaId: idea.id,
    scriptDraft: idea.scriptOutline.join('\n\n'),
    shotList: [
      { id: 'shot-hook', label: 'Talking hook', done: false },
      { id: 'shot-wrong', label: 'Wrong rep or mistake', done: false },
      { id: 'shot-corrected', label: 'Corrected rep or cue', done: false },
      { id: 'shot-cta', label: 'CTA clip', done: false },
    ],
    brollChecklist: [
      { id: 'broll-setup', label: 'Tripod setup', done: false },
      { id: 'broll-close', label: 'Close-up cue', done: false },
      { id: 'broll-cover', label: 'Cover frame', done: false },
    ],
    coverTitleVariants: [truncate(idea.title, 40), 'Stop making this mistake', 'One cue that fixes it'],
    platformVariants,
    approvalState: 'needs-video',
    validationErrors: [],
    approvalAudit: [],
    createdAt: scheduledAt,
  }
  return validatePostPackage(postPackage)
}

export function validatePostPackage(postPackage: PostPackage): PostPackage {
  const errors: string[] = []
  if (!postPackage.scriptDraft.trim()) errors.push('Add a script draft before approval.')
  if (!postPackage.videoFile?.trim()) errors.push('Attach a vertical video file before approval.')
  if (postPackage.shotList.length === 0) errors.push('Add at least one shot list item.')
  if (postPackage.coverTitleVariants.filter(item => item.trim()).length === 0) errors.push('Add at least one cover/title variant.')
  const enabledPlatforms = GROWTH_PLATFORMS.filter(platform => postPackage.platformVariants[platform]?.enabled)
  if (enabledPlatforms.length === 0) errors.push('Enable at least one staging platform.')
  for (const platform of enabledPlatforms) {
    const variant = postPackage.platformVariants[platform]
    if (!variant.title.trim()) errors.push(`${PLATFORM_LABEL[platform]} needs a title.`)
    if (!variant.caption.trim()) errors.push(`${PLATFORM_LABEL[platform]} needs a caption.`)
    if (!variant.scheduledAt.trim()) errors.push(`${PLATFORM_LABEL[platform]} needs a scheduled time.`)
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
  const at = new Date().toISOString()
  if (validated.validationErrors.length > 0) {
    return {
      ...validated,
      approvalState: 'blocked',
      approvalAudit: [
        ...validated.approvalAudit,
        { id: createGrowthId('audit'), event: 'blocked', actor: 'system', at, notes: validated.validationErrors.join(' ') },
      ],
    }
  }
  const now = new Date().toISOString()
  return {
    ...validated,
    approvalState: 'queued',
    approvedAt: now,
    queuedAt: now,
    validationErrors: [],
    approvalAudit: [
      ...validated.approvalAudit,
      { id: createGrowthId('audit'), event: 'approved', actor: 'local-user', at: now, notes: 'Internal staging approval recorded.' },
      { id: createGrowthId('audit'), event: 'queued', actor: 'system', at: now, notes: 'Queued internally; no live publish control exposed.' },
    ],
  }
}

export function addManualViralVideo(state: GrowthOpsState, video: Omit<ViralVideo, 'id' | 'capturedAt' | 'source' | 'sourceConfidence'>): GrowthOpsState {
  const nextVideo: ViralVideo = { ...video, id: createGrowthId('viral'), source: 'manual-link', sourceConfidence: 'medium', capturedAt: new Date().toISOString() }
  return updateRecipeLearning({ ...state, viralVideos: dedupeViralVideos([nextVideo, ...state.viralVideos]) })
}

export function buildWeeklyContentCalendar(state: GrowthOpsState, now = new Date()): GrowthCalendarSlot[] {
  const dayMs = 24 * 60 * 60 * 1000
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const slots: GrowthCalendarSlot[] = []
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(start.getTime() + day * dayMs).toISOString().slice(0, 10)
    for (const platform of GROWTH_PLATFORMS) {
      slots.push({
        id: `slot-${date}-${platform}`,
        date,
        platform,
        state: 'idea',
        title: 'Open slot',
        batchRecording: day === 1 || day === 4,
        order: day * GROWTH_PLATFORMS.length + GROWTH_PLATFORMS.indexOf(platform),
      })
    }
  }
  return slots
    .map(slot => {
      const postPackage = state.postPackages.find(item => item.platformVariants[slot.platform]?.scheduledAt?.slice(0, 10) === slot.date)
      if (postPackage) {
        const idea = state.contentIdeas.find(item => item.id === postPackage.ideaId)
        const stateForPackage: GrowthCalendarSlotState =
          postPackage.approvalState === 'queued'
            ? 'queued'
            : postPackage.approvalState === 'ready-for-approval'
              ? 'ready-for-approval'
              : postPackage.approvalState === 'draft' || postPackage.approvalState === 'blocked' || postPackage.approvalState === 'needs-video'
                ? 'needs-video'
                : 'scripted'
        return { ...slot, ideaId: postPackage.ideaId, postPackageId: postPackage.id, state: stateForPackage, title: idea?.title || postPackage.platformVariants[slot.platform]?.title || postPackage.ideaId }
      }
      const plannedIdea = state.contentIdeas.find(idea => idea.plannedSlots.some(planned => planned.date === slot.date && planned.platform === slot.platform))
      if (plannedIdea) return { ...slot, ideaId: plannedIdea.id, state: normalizeCalendarSlotState(plannedIdea.status), title: plannedIdea.title }
      return slot
    })
    .sort((left, right) => left.order - right.order)
}

export function buildTodaysShootList(state: GrowthOpsState, now = new Date()): GrowthCalendarSlot[] {
  const today = now.toISOString().slice(0, 10)
  const calendarItems = buildWeeklyContentCalendar(state, now).filter(slot => slot.date === today && slot.title !== 'Open slot')
  const ideaItems = state.contentIdeas
    .filter(idea => (idea.makeToday || idea.status === 'scripted' || idea.status === 'queued' || idea.status === 'needs-video') && !calendarItems.some(slot => slot.ideaId === idea.id))
    .map((idea, index): GrowthCalendarSlot => ({
      id: `shoot-${today}-${idea.id}`,
      date: today,
      platform: 'tiktok',
      state: normalizeCalendarSlotState(idea.status),
      ideaId: idea.id,
      title: idea.title,
      batchRecording: false,
      order: 100 + index,
    }))
  const packageItems = state.postPackages
    .filter(postPackage => ['queued', 'ready-for-approval', 'needs-video', 'draft'].includes(postPackage.approvalState))
    .filter(postPackage => !calendarItems.some(slot => slot.postPackageId === postPackage.id))
    .map((postPackage, index): GrowthCalendarSlot => {
      const idea = state.contentIdeas.find(item => item.id === postPackage.ideaId)
      return {
        id: `shoot-${today}-${postPackage.id}`,
        date: today,
        platform: 'tiktok',
        state: postPackage.approvalState === 'queued' || postPackage.approvalState === 'ready-for-approval' ? postPackage.approvalState : 'needs-video',
        ideaId: postPackage.ideaId,
        postPackageId: postPackage.id,
        title: idea?.title || postPackage.ideaId,
        batchRecording: false,
        order: 200 + index,
      }
    })
  return [...calendarItems, ...ideaItems, ...packageItems].sort((left, right) => left.order - right.order)
}

export function moveIdeaInQueue(state: GrowthOpsState, ideaId: string, direction: -1 | 1): GrowthOpsState {
  const index = state.contentIdeas.findIndex(idea => idea.id === ideaId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= state.contentIdeas.length) return state
  const contentIdeas = state.contentIdeas.slice()
  const [idea] = contentIdeas.splice(index, 1)
  contentIdeas.splice(nextIndex, 0, idea)
  return { ...state, contentIdeas }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseGrowthCsvRows(input: string): Array<Record<string, string>> {
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0]).map(header => normalizeText(header).replaceAll(' ', '_'))
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
}

function rowValue(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const normalizedKey = normalizeText(key).replaceAll(' ', '_')
    const value = row[normalizedKey] ?? row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function metricNumber(row: Record<string, string>, keys: string[]): number {
  const raw = rowValue(row, keys).toLowerCase().replace(/,/g, '')
  if (!raw) return 0
  const multiplier = raw.endsWith('k') ? 1000 : raw.endsWith('m') ? 1000000 : 1
  const value = Number.parseFloat(raw.replace(/[^\d.]+/g, ''))
  return Number.isFinite(value) ? Math.round(value * multiplier) : 0
}

function inferPlatform(value: string): GrowthPlatform {
  const normalized = normalizeText(value)
  if (normalized.includes('instagram') || normalized.includes('reel')) return 'instagram'
  if (normalized.includes('youtube') || normalized.includes('short')) return 'youtube'
  return 'tiktok'
}

function findImportAttribution(state: GrowthOpsState, row: Record<string, string>) {
  const explicitPackage = rowValue(row, ['package', 'package_id', 'post_package_id'])
  const explicitIdea = rowValue(row, ['idea', 'idea_id'])
  const explicitRecipe = rowValue(row, ['recipe', 'recipe_id'])
  const topic = rowValue(row, ['topic', 'content_topic'])
  const rawUrl = rowValue(row, ['url', 'video_url', 'permalink'])
  const url = rawUrl ? normalizeVideoUrl(rawUrl) : ''
  const normalizedTopic = normalizeText(topic)
  const postPackage = state.postPackages.find(
    item =>
      (explicitPackage && item.id === explicitPackage) ||
      (explicitIdea && item.ideaId === explicitIdea) ||
      (url && Object.values(item.platformVariants).some(variant => normalizeVideoUrl(variant.remotePostId ?? '') === url)),
  )
  const idea = state.contentIdeas.find(
    item =>
      (explicitIdea && item.id === explicitIdea) ||
      item.id === postPackage?.ideaId ||
      (normalizedTopic && normalizeText(item.title).includes(normalizedTopic)),
  )
  const recipe = state.contentRecipes.find(
    item =>
      (explicitRecipe && item.id === explicitRecipe) ||
      item.id === idea?.recipeId ||
      (normalizedTopic && item.topics.some(recipeTopic => normalizedTopic.includes(normalizeText(recipeTopic)))),
  )
  return { postPackage, idea, recipe, topic }
}

export function previewAnalyticsImport(state: GrowthOpsState, rows: Array<Record<string, string>> | string): GrowthAnalyticsImportRow[] {
  const parsedRows = typeof rows === 'string' ? parseGrowthCsvRows(rows) : rows
  const measuredAt = new Date().toISOString()
  return parsedRows.map((row, index) => {
    const platform = inferPlatform(rowValue(row, ['platform', 'network', 'channel']))
    const attribution = findImportAttribution(state, row)
    const source = normalizeSource(rowValue(row, ['source']) || 'owned-analytics', 'owned-analytics')
    const confidence = normalizeConfidence(rowValue(row, ['confidence', 'source_confidence']), attribution.postPackage || attribution.idea || attribution.recipe ? 'high' : 'low')
    const horizon = normalizeHorizon(rowValue(row, ['horizon', 'age', 'window']))
    const metrics = {
      views: metricNumber(row, ['views', 'plays', 'impressions']),
      likes: metricNumber(row, ['likes']),
      comments: metricNumber(row, ['comments', 'replies']),
      shares: metricNumber(row, ['shares', 'reposts']),
      saves: metricNumber(row, ['saves', 'bookmarks']),
      watchRetention: metricNumber(row, ['watch_retention', 'retention']),
      followerDelta: metricNumber(row, ['follower_delta', 'followers']),
      leadSignal: metricNumber(row, ['lead_signal', 'leads', 'dms']),
    }
    const attributed = Boolean(attribution.postPackage || attribution.idea || attribution.recipe)
    return {
      id: `import-${Date.now()}-${index}`,
      raw: row,
      platform,
      postPackageId: attribution.postPackage?.id,
      ideaId: attribution.idea?.id,
      recipeId: attribution.recipe?.id,
      topic: attribution.topic || attribution.recipe?.topics[0] || attribution.idea?.title,
      horizon,
      source,
      confidence,
      metrics,
      measuredAt: rowValue(row, ['measured_at', 'date']) || measuredAt,
      attributed,
      quarantineReason: attributed ? undefined : 'Missing package, idea, recipe, or topic attribution.',
    }
  })
}

export function commitAnalyticsImport(state: GrowthOpsState, previewRows: GrowthAnalyticsImportRow[]): GrowthOpsState {
  const snapshots: PostMetricSnapshot[] = previewRows
    .filter(row => row.attributed)
    .map(row => ({
      id: createGrowthId('metric'),
      postPackageId: row.postPackageId ?? '',
      ideaId: row.ideaId,
      recipeId: row.recipeId,
      topic: row.topic,
      platform: row.platform,
      measuredAt: row.measuredAt,
      horizon: row.horizon,
      metrics: row.metrics,
      source: row.source,
      confidence: row.confidence,
      evidenceSummary: `${PLATFORM_LABEL[row.platform]} ${row.horizon} import: ${row.metrics.views} views, ${row.metrics.saves} saves, ${row.confidence} confidence.`,
    }))
  const quarantined: GrowthQuarantinedAnalyticsRow[] = previewRows
    .filter(row => !row.attributed)
    .map(row => ({
      id: createGrowthId('quarantine'),
      raw: row.raw,
      platform: row.platform,
      source: row.source,
      confidence: row.confidence,
      quarantineReason: row.quarantineReason ?? 'Missing attribution.',
      capturedAt: new Date().toISOString(),
    }))
  return updateRecipeLearning({
    ...state,
    metricSnapshots: [...snapshots, ...state.metricSnapshots],
    quarantinedAnalyticsRows: [...quarantined, ...state.quarantinedAnalyticsRows],
  })
}

export function updateCalendarSlots(state: GrowthOpsState, slots: GrowthCalendarSlot[]): GrowthOpsState {
  const slotsByIdea = new Map<string, GrowthCalendarSlot[]>()
  for (const slot of slots) {
    if (!slot.ideaId) continue
    slotsByIdea.set(slot.ideaId, [...(slotsByIdea.get(slot.ideaId) ?? []), slot])
  }
  const contentIdeas = state.contentIdeas.map(idea => {
    const plannedSlots = slotsByIdea.get(idea.id)
    if (!plannedSlots) return idea
    const primaryState = plannedSlots[0]?.state ?? idea.status
    return {
      ...idea,
      status: primaryState,
      makeToday: plannedSlots.some(slot => slot.date === new Date().toISOString().slice(0, 10)),
      plannedSlots: plannedSlots.slice().sort((left, right) => left.order - right.order),
    }
  })
  const postPackages = state.postPackages.map(postPackage => {
    const matching = slots.filter(slot => slot.postPackageId === postPackage.id)
    if (matching.length === 0) return postPackage
    return {
      ...postPackage,
      platformVariants: {
        ...postPackage.platformVariants,
        ...Object.fromEntries(
          matching.map(slot => [
            slot.platform,
            {
              ...postPackage.platformVariants[slot.platform],
              scheduledAt: `${slot.date}T12:00:00.000Z`,
            },
          ]),
        ),
      },
    }
  })
  return { ...state, contentIdeas, postPackages }
}

export function normalizeGrowthConnector(value: unknown): GrowthConnectorStatus | null {
  if (!isRecord(value)) return null
  const platform = normalizeGrowthPlatform(value.platform)
  const status = String(value.status ?? 'not_configured')
  if (!['not_configured', 'configured', 'oauth_required', 'permission_missing', 'review_required', 'ready', 'error'].includes(status)) return null
  const service = typeof value.service === 'string' ? value.service : `social.${platform}`
  const permissions = normalizeStringArray(value.permissions)
  const requiredScopes = normalizeStringArray(value.requiredScopes, REQUIRED_SCOPES[platform])
  const rawDiagnostics = isRecord(value.diagnostics) ? value.diagnostics : { tokenStored: false, readinessOnly: true, checkedSecretService: service }
  const diagnostics = Object.fromEntries(
    Object.entries(rawDiagnostics).filter(([key]) => !/(^|_)(access|refresh)?token($|_)/i.test(key) && !/secret|credential/i.test(key)),
  )
  return {
    id: String(value.id ?? platform),
    platform,
    status: status as GrowthConnectorStatus['status'],
    accountLabel: typeof value.accountLabel === 'string' ? value.accountLabel : null,
    permissions,
    requiredScopes,
    service,
    blockingReason: typeof value.blockingReason === 'string' ? value.blockingReason : undefined,
    lastCheckedAt: typeof value.lastCheckedAt === 'string' ? value.lastCheckedAt : undefined,
    lastSuccessfulReadOnlyCheckAt: typeof value.lastSuccessfulReadOnlyCheckAt === 'string' ? value.lastSuccessfulReadOnlyCheckAt : null,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    diagnostics: { ...diagnostics, tokenStored: false, readinessOnly: diagnostics.readinessOnly ?? true },
  }
}
