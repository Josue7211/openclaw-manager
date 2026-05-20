import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  Plus,
  MagnifyingGlass,
  ArrowRight,
  Archive,
  FunnelSimple,
  Sparkle,
  ArrowSquareOut,
  CheckCircle,
  MapPin,
  Clock,
  CurrencyDollar,
  PencilSimple,
  X,
} from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { careerOpsApi } from './career-ops-api'
import { OpportunityQueue } from './career-ops/OpportunityQueue'
import { DossierPanel } from './career-ops/DossierPanel'
import { ActionQueue } from './career-ops/ActionQueue'
import { ProfilePanel } from './career-ops/ProfilePanel'
import { IntakePanel } from './career-ops/IntakePanel'
import type {
  CareerProfile,
  CareerLane,
  CareerApplication,
  CareerOutcome,
  CareerSearchRun,
  JobFeedback,
  JobForm,
  JobSearchResponse,
  LifeMode,
  LiveJob,
  OpportunityDossier,
  RankedJobCard,
  ExecutedApplicationBatch,
  PreparedApplicationBatch,
  ReviewQueueItem,
  ReviewQueueMode,
  SavedSearch,
  SearchSourceKey,
  StageId,
  WorkMode,
  LeadReminder,
} from '@/features/career-ops/types'
import {
  CASH_NOW_QUERIES,
  CAREER_OPS_MIGRATION_KEY,
  DEFAULT_SOURCE_KEYS,
  LOW_SIGNAL_SCORE_FLOOR,
  TARGET_PROFILE,
  LIFE_MODE_CONFIG,
  WORK_MODES,
  TRACKED_STORAGE_KEY,
  REVIEW_QUEUE_STORAGE_KEY,
  FEEDBACK_STORAGE_KEY,
  SAVED_SEARCHES_STORAGE_KEY,
  LIFE_MODE_STORAGE_KEY,
  STAGES,
  createId,
  truncate,
  loadTrackedLeads,
  loadCareerProfile,
  loadDossiers,
  saveDossiers,
  saveCareerProfile,
  loadReviewQueue,
  loadFeedback,
  loadSavedSearches,
  loadLifeMode,
  jobKey,
  ageInDays,
  buildJobAnalysis,
  uniqueStrings,
  nextStage,
  formatDate,
  badgeStyle,
  reviewQueueFromJob,
  shouldAutoQueueBrowserReview,
  normalizeTags,
  buildSearchQuery,
  serializeSources,
  toggleSource,
  estimateHourlyRate,
  formatHourlyRate,
  buildGoogleSearchUrl,
  buildGoogleSearchUrlFromText,
  defaultCareerProfile,
  defaultCareerSavedSearches,
  recommendApplication,
  applyModeLabel,
  applyModeStyle,
  applyModeRank,
  createDossierFromJob,
  createDossierFromManualIntake,
  dossierToTrackedLead,
  evaluateDossier,
  generateDossierAssets,
  migrateLeadToDossier,
  sortDossiersForQueue,
  laneForDossier,
  rankCashNowJobCards,
  buildLaneBrowserSearches,
} from '@/features/career-ops/domain'

const DEFAULT_FORM: JobForm = {
  company: '',
  role: '',
  location: 'Remote - US',
  source: 'Manual',
  stage: 'sourcing',
  nextAction: 'Score opportunity and tailor assets',
  due: 'Today',
  priority: 'medium',
  tags: '',
  notes: '',
}

const QUICK_SEARCHES = [
  'AI automation',
  'data annotation',
  'entry level IT',
  'computer engineering intern',
  'machine learning intern',
  'no experience',
]

type OpportunityTrack = 'all' | CareerLane
type CareerOpsView =
  | 'command'
  | 'cash-now'
  | 'engineering'
  | 'trainer'
  | 'applications'
  | 'pipeline'
  | 'packet'
  | 'settings'

const CAREER_OPS_VIEWS: Array<{
  id: CareerOpsView
  label: string
  blurb: string
}> = [
  { id: 'command', label: 'Command', blurb: 'Cash-now queue, batches, follow-ups, interviews, and today.' },
  { id: 'cash-now', label: 'Cash Now', blurb: 'Fort Myers part-time and fast-hire roles at $18/hr+.' },
  { id: 'engineering', label: 'Career Track', blurb: 'Engineering, AI, IT, data, and internships.' },
  { id: 'trainer', label: 'Trainer Growth', blurb: 'Trainer jobs, coaching leads, and content opportunities.' },
  { id: 'applications', label: 'Applications', blurb: 'Prepare approved apply batches and browser-safe execution.' },
  { id: 'pipeline', label: 'Pipeline', blurb: 'Move dossiers through stages and follow-ups.' },
  { id: 'packet', label: 'Packet', blurb: 'Resume bullets, pitches, common answers, links, availability.' },
  { id: 'settings', label: 'Settings', blurb: 'Saved searches, sources, migration, and manual intake.' },
]

const TRACK_CONFIG: Record<
  OpportunityTrack,
  {
    label: string
    blurb: string
    quickSearches: string[]
    intakeSource: string
    intakeAction: string
  }
> = {
  all: {
    label: 'All',
    blurb: 'Engineering search and trainer growth in one queue.',
    quickSearches: QUICK_SEARCHES,
    intakeSource: 'Manual',
    intakeAction: 'Score opportunity and tailor assets',
  },
  'cash-now': {
    label: 'Cash Now',
    blurb: 'Part-time Fort Myers work first: $18/hr floor, evening/weekend/flexible boosts, apply today.',
    quickSearches: CASH_NOW_QUERIES,
    intakeSource: 'Cash-now intake',
    intakeAction: 'Apply today, call/visit, then follow up same day',
  },
  engineering: {
    label: 'Engineering',
    blurb: 'Internships, remote work, projects, applications, and follow-ups.',
    quickSearches: [
      'computer engineering intern remote',
      'software engineering internship remote',
      'AI automation internship',
      'entry level IT remote',
      'data annotation engineering',
      'Fort Myers engineering internship',
    ],
    intakeSource: 'Engineering intake',
    intakeAction: 'Tailor resume, apply, and follow up',
  },
  trainer: {
    label: 'Trainer',
    blurb: 'Online coaching, socials, influencer research, content tests, and leads.',
    quickSearches: [
      'online fitness coaching content ideas',
      'personal trainer Fort Myers FGCU',
      'fitness influencer content analysis',
      'Instagram personal trainer lead magnets',
      'online coaching offer examples',
      'Amped Fitness trainer social posts',
    ],
    intakeSource: 'Trainer growth idea',
    intakeAction: 'Turn into content, outreach, or coaching offer test',
  },
}

const SOURCE_OPTIONS: Array<{
  id: SearchSourceKey
  label: string
  description: string
}> = [
  {
    id: 'remotive',
    label: 'Remotive',
    description: 'Remote-first jobs with salary fields and a clean public API.',
  },
  {
    id: 'remoteok',
    label: 'Remote OK',
    description: 'Large remote jobs feed with direct employer links.',
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    description: 'Direct company postings with less board noise.',
  },
]

function openExternal(url: string): boolean {
  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'))
}

function applyProfileToDossier(dossier: OpportunityDossier, profile: CareerProfile): OpportunityDossier {
  return generateDossierAssets(evaluateDossier(dossier, profile), profile)
}

function careerOpsMigratedToBackend(): boolean {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem(CAREER_OPS_MIGRATION_KEY))
}

function initialCareerProfile(): CareerProfile {
  return careerOpsMigratedToBackend() ? defaultCareerProfile() : loadCareerProfile()
}

function initializeDossiers(profile: CareerProfile): OpportunityDossier[] {
  if (careerOpsMigratedToBackend()) return []

  const storedDossiers = sortDossiersForQueue(loadDossiers())
  if (storedDossiers.length > 0) return storedDossiers

  const legacyLeads = loadTrackedLeads()
    .map(migrateLeadToDossier)
    .map(dossier => applyProfileToDossier(dossier, profile))

  return sortDossiersForQueue(legacyLeads)
}

function dossierMatchesTrack(dossier: OpportunityDossier, track: OpportunityTrack): boolean {
  if (track === 'all') return true
  return laneForDossier(dossier) === track
}

function trackForView(view: CareerOpsView): OpportunityTrack {
  if (view === 'cash-now' || view === 'engineering' || view === 'trainer') return view
  return 'all'
}

function laneForTrack(track: OpportunityTrack, fallback: CareerLane = 'engineering'): CareerLane {
  return track === 'all' ? fallback : track
}

function laneForSavedSearch(search: SavedSearch): CareerLane {
  const text = `${search.name} ${search.query}`.toLowerCase()
  if (/trainer|fitness|gym|coach/.test(text)) return 'trainer'
  if (/cash|part time|part-time|fort myers|33905|server|warehouse|retail|weekend|evening|front desk/.test(text))
    return 'cash-now'
  return 'engineering'
}

function formatPacketValue(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map(item => String(item))
      .filter(Boolean)
      .join(', ')
  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join('\n')
  return String(value ?? '')
}

interface PacketChecklistItem {
  label: string
  detail: string
  ok: boolean
}

interface ConversionStat {
  lane: CareerLane
  source: string
  query: string
  total: number
  applied: number
  callbacks: number
  interviews: number
  offers: number
  rejected: number
  latestLesson: string
}

function buildBatchPacketChecklist(profile: CareerProfile, candidates: OpportunityDossier[]): PacketChecklistItem[] {
  const packet = profile.resumePacket
  const lanes = new Set(candidates.map(laneForDossier))
  const hasLane = (lane: CareerLane) => lanes.size === 0 || lanes.has(lane)
  const linksCount = Object.values(profile.links ?? {}).filter(Boolean).length
  const proofCount = (packet?.workHistory.length ?? 0) + (packet?.projectProof.length ?? 0)
  const payFloors = profile.payFloors ?? {
    'cash-now': 18,
    engineering: profile.payFloor,
    trainer: 18,
  }

  return [
    {
      label: 'Availability',
      detail: profile.availability?.trim() || 'Add availability before batch apply.',
      ok: Boolean(profile.availability?.trim()),
    },
    {
      label: 'Base bullets',
      detail: `${packet?.baseBullets.length ?? 0} saved`,
      ok: (packet?.baseBullets.length ?? 0) > 0,
    },
    {
      label: 'Common pay answer',
      detail: packet?.commonAnswers.desiredPay || 'Add desired pay answer.',
      ok: Boolean(packet?.commonAnswers.desiredPay?.trim()),
    },
    {
      label: 'Cash-now floor',
      detail: `$${payFloors['cash-now'] ?? 18}/hr`,
      ok: !hasLane('cash-now') || (payFloors['cash-now'] ?? 0) >= 18,
    },
    {
      label: 'Cash-now cover',
      detail: packet?.coverTemplates['cash-now'] || 'Add cash-now note.',
      ok: !hasLane('cash-now') || Boolean(packet?.coverTemplates['cash-now']?.trim()),
    },
    {
      label: 'Engineering pitch',
      detail: packet?.engineeringPitch || 'Add engineering pitch.',
      ok: !hasLane('engineering') || Boolean(packet?.engineeringPitch?.trim()),
    },
    {
      label: 'Trainer pitch',
      detail: packet?.trainerPitch || 'Add trainer pitch.',
      ok: !hasLane('trainer') || Boolean(packet?.trainerPitch?.trim()),
    },
    {
      label: 'Proof bullets',
      detail: `${proofCount} work/project proof items`,
      ok: proofCount > 0 || lanes.size === 1 && lanes.has('cash-now'),
    },
    {
      label: 'Links',
      detail: `${linksCount} saved`,
      ok: linksCount > 0 || lanes.size === 1 && lanes.has('cash-now'),
    },
  ]
}

function payFloorForLane(profile: CareerProfile, lane: CareerLane): number {
  return profile.payFloors?.[lane] ?? (lane === 'engineering' ? profile.payFloor : 18)
}

function profileWithLanePayFloor(profile: CareerProfile, lane: CareerLane, payFloor: number): CareerProfile {
  return {
    ...profile,
    payFloor: lane === 'engineering' ? payFloor : profile.payFloor,
    payFloors: {
      'cash-now': profile.payFloors?.['cash-now'] ?? 18,
      engineering: profile.payFloors?.engineering ?? profile.payFloor,
      trainer: profile.payFloors?.trainer ?? 18,
      [lane]: payFloor,
    },
  }
}

function applicationDossierLabel(application: CareerApplication, dossiers: OpportunityDossier[]): string {
  const dossier = dossiers.find(item => item.id === application.dossierId)
  if (dossier) return `${dossier.company} · ${dossier.role}`
  const snapshot = application.packetSnapshot.dossier
  if (snapshot && typeof snapshot === 'object') {
    const row = snapshot as Record<string, unknown>
    const company = typeof row.company === 'string' ? row.company : 'Saved company'
    const role = typeof row.role === 'string' ? row.role : 'Saved role'
    return `${company} · ${role}`
  }
  return application.dossierId
}

function outcomeDossierLabel(outcome: CareerOutcome, dossiers: OpportunityDossier[]): string {
  const dossier = outcome.dossierId ? dossiers.find(item => item.id === outcome.dossierId) : null
  if (dossier) return `${dossier.company} · ${dossier.role}`
  return outcome.dossierId || outcome.applicationId || 'Outcome'
}

function metadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

function searchRunSourceLabel(run: CareerSearchRun): string {
  return run.sourceSet.length > 0 ? run.sourceSet.join(', ') : 'browser/public'
}

function savedSearchLearningScore(search: SavedSearch, stats: ConversionStat[]): number {
  const searchQuery = search.query.trim().toLowerCase()
  if (!searchQuery) return 0
  return stats.reduce((score, stat) => {
    const statQuery = stat.query.trim().toLowerCase()
    if (!statQuery) return score
    const matches = statQuery === searchQuery || statQuery.includes(searchQuery) || searchQuery.includes(statQuery)
    if (!matches) return score
    return score + stat.offers * 30 + stat.interviews * 15 + stat.callbacks * 8 + stat.applied * 2 - stat.rejected * 5
  }, 0)
}

export default function JobHunterPage() {
  const initialProfile = initialCareerProfile()
  const [careerProfile, setCareerProfile] = useState<CareerProfile>(() => initialProfile)
  const [dossiers, setDossiers] = useState<OpportunityDossier[]>(() => initializeDossiers(initialProfile))
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null)
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>(() => loadReviewQueue())
  const [jobFeedback, setJobFeedback] = useState<Record<string, JobFeedback>>(() => loadFeedback())
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    if (careerOpsMigratedToBackend()) return defaultCareerSavedSearches()
    const storedSearches = loadSavedSearches()
    return storedSearches.length > 0 ? storedSearches : defaultCareerSavedSearches()
  })
  const [lifeMode, setLifeMode] = useState<LifeMode>(() => loadLifeMode())
  const [reviewCursor, setReviewCursor] = useState(0)
  const [stageFilter, setStageFilter] = useState<StageId | 'all'>('all')
  const initialLifeMode = loadLifeMode()
  const [searchInput, setSearchInput] = useState(LIFE_MODE_CONFIG[initialLifeMode].defaultQuery)
  const [savedSearchName, setSavedSearchName] = useState('')
  const [mode, setMode] = useState<WorkMode>('local-fallback')
  const [submittedQuery, setSubmittedQuery] = useState(
    buildSearchQuery(LIFE_MODE_CONFIG[initialLifeMode].defaultQuery, 'local-fallback'),
  )
  const [selectedSources, setSelectedSources] = useState<SearchSourceKey[]>(DEFAULT_SOURCE_KEYS)
  const [smartFilter, setSmartFilter] = useState(LIFE_MODE_CONFIG[initialLifeMode].smartFilter)
  const [browserAssistEnabled, setBrowserAssistEnabled] = useState(LIFE_MODE_CONFIG[initialLifeMode].browserAssist)
  const [strictReviewFilter, setStrictReviewFilter] = useState(LIFE_MODE_CONFIG[initialLifeMode].strictReviewFilter)
  const [minimumHourlyRate, setMinimumHourlyRate] = useState(() => initialProfile.payFloors?.['cash-now'] ?? 18)
  const [showAllJobs, setShowAllJobs] = useState(false)
  const [activeView, setActiveView] = useState<CareerOpsView>('command')
  const [activeTrack, setActiveTrack] = useState<OpportunityTrack>('all')
  const [form, setForm] = useState<JobForm>(DEFAULT_FORM)
  const [preparedBatch, setPreparedBatch] = useState<PreparedApplicationBatch | null>(null)
  const [executedBatch, setExecutedBatch] = useState<ExecutedApplicationBatch | null>(null)
  const [batchCapability, setBatchCapability] = useState('')
  const [batchStatus, setBatchStatus] = useState<string | null>(null)
  const [outcomeLesson, setOutcomeLesson] = useState('')
  const [outcomeStatus, setOutcomeStatus] = useState<string | null>(null)
  const [reminderStatus, setReminderStatus] = useState<string | null>(null)
  const [blitzStatus, setBlitzStatus] = useState<string | null>(null)
  const [creatingReminders, setCreatingReminders] = useState(false)
  const [createdReminderIds, setCreatedReminderIds] = useState<string[]>([])
  const hasAppliedProfileEdit = useRef(false)
  const hasMigratedToBackend = useRef(false)
  const hasSeededDefaultSearches = useRef(false)
  const hasTouchedSavedSearches = useRef(false)

  const trackedLeads = useMemo(() => dossiers.map(dossierToTrackedLead), [dossiers])

  useEffect(() => {
    if (typeof window === 'undefined' || careerOpsMigratedToBackend()) return
    saveDossiers(dossiers)
    localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(trackedLeads))
  }, [dossiers, trackedLeads])

  useEffect(() => {
    if (typeof window === 'undefined' || careerOpsMigratedToBackend()) return
    saveCareerProfile(careerProfile)
  }, [careerProfile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(REVIEW_QUEUE_STORAGE_KEY, JSON.stringify(reviewQueue))
  }, [reviewQueue])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(jobFeedback))
  }, [jobFeedback])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (careerOpsMigratedToBackend()) return
    localStorage.setItem(SAVED_SEARCHES_STORAGE_KEY, JSON.stringify(savedSearches))
  }, [savedSearches])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(LIFE_MODE_STORAGE_KEY, lifeMode)
  }, [lifeMode])

  useEffect(() => {
    if (!hasAppliedProfileEdit.current) {
      hasAppliedProfileEdit.current = true
      return
    }
    setDossiers(prev => sortDossiersForQueue(prev.map(dossier => applyProfileToDossier(dossier, careerProfile))))
  }, [careerProfile])

  const careerProfileQuery = useQuery({
    queryKey: ['career-ops', 'profile'],
    queryFn: () => careerOpsApi.getProfile(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (careerProfileQuery.data) {
      setCareerProfile(careerProfileQuery.data)
      setMinimumHourlyRate(careerProfileQuery.data.payFloors?.['cash-now'] ?? 18)
    }
  }, [careerProfileQuery.data])

  const backendDossiersQuery = useQuery({
    queryKey: ['career-ops', 'dossiers', careerProfile.payFloor],
    queryFn: () => careerOpsApi.listDossiers(careerProfile),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const { refetch: refetchBackendDossiers } = backendDossiersQuery

  const syncStatusQuery = useQuery({
    queryKey: ['career-ops', 'sync-status'],
    queryFn: () => careerOpsApi.getSyncStatus(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const backendSavedSearchesQuery = useQuery({
    queryKey: ['career-ops', 'saved-searches'],
    queryFn: () => careerOpsApi.listSavedSearches(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const applicationHistoryQuery = useQuery({
    queryKey: ['career-ops', 'applications'],
    queryFn: () => careerOpsApi.listApplications(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const { refetch: refetchApplications } = applicationHistoryQuery

  const outcomeHistoryQuery = useQuery({
    queryKey: ['career-ops', 'outcomes'],
    queryFn: () => careerOpsApi.listOutcomes(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const { refetch: refetchOutcomes } = outcomeHistoryQuery

  const searchRunHistoryQuery = useQuery({
    queryKey: ['career-ops', 'search-runs'],
    queryFn: () => careerOpsApi.listSearchRuns(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const { refetch: refetchSearchRuns } = searchRunHistoryQuery

  useEffect(() => {
    if (backendDossiersQuery.data && backendDossiersQuery.data.length > 0) {
      setDossiers(backendDossiersQuery.data)
    }
  }, [backendDossiersQuery.data])

  useEffect(() => {
    if (hasTouchedSavedSearches.current) return
    if (backendSavedSearchesQuery.data && backendSavedSearchesQuery.data.length > 0) {
      setSavedSearches(backendSavedSearchesQuery.data)
    }
  }, [backendSavedSearchesQuery.data])

  useEffect(() => {
    if (hasTouchedSavedSearches.current) return
    if (!backendSavedSearchesQuery.isSuccess || hasSeededDefaultSearches.current) return
    if ((backendSavedSearchesQuery.data ?? []).length > 0) return

    hasSeededDefaultSearches.current = true
    const defaults = defaultCareerSavedSearches()
    setSavedSearches(defaults)
    Promise.allSettled(defaults.map(search => careerOpsApi.saveSearch(search, laneForSavedSearch(search)))).catch(
      () => {},
    )
  }, [backendSavedSearchesQuery.data, backendSavedSearchesQuery.isSuccess])

  useEffect(() => {
    if (hasMigratedToBackend.current || typeof window === 'undefined') return
    if (localStorage.getItem(CAREER_OPS_MIGRATION_KEY)) return
    hasMigratedToBackend.current = true
    const storedSearches = loadSavedSearches()
    Promise.all([
      careerOpsApi.putProfile(careerProfile),
      ...dossiers.map(dossier => careerOpsApi.upsertDossier(dossier)),
      ...storedSearches.map(search => careerOpsApi.saveSearch(search, laneForSavedSearch(search))),
    ])
      .then(() => {
      localStorage.setItem(CAREER_OPS_MIGRATION_KEY, new Date().toISOString())
      })
      .catch(() => {
        hasMigratedToBackend.current = false
      })
  }, [careerProfile, dossiers])

  const liveJobsQuery = useQuery({
    queryKey: ['job-hunter', submittedQuery, selectedSources.join(','), smartFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (submittedQuery.trim()) params.set('q', submittedQuery.trim())
      params.set('limit', '24')
      params.set('sources', serializeSources(selectedSources))
      params.set('smart_filter', String(smartFilter))
      params.set('max_age_days', smartFilter ? '21' : '60')
      return api.get<JobSearchResponse>(`/api/jobs/search?${params.toString()}`)
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const liveJobs = liveJobsQuery.data?.jobs ?? []
  const activeLifeMode = LIFE_MODE_CONFIG[lifeMode]

  useEffect(() => {
    if (!browserAssistEnabled || liveJobs.length === 0) return

    const strongMatches = liveJobs.filter(job => shouldAutoQueueBrowserReview(job, minimumHourlyRate))

    if (strongMatches.length === 0) return

    setReviewQueue(prev => {
      const seen = new Set(prev.map(item => item.url))
      const additions = strongMatches.filter(job => !seen.has(job.url)).map(job => reviewQueueFromJob(job, 'browser'))

      if (additions.length === 0) return prev

      return [...additions, ...prev].sort(
        (a, b) => b.score - a.score || new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime(),
      )
    })
  }, [browserAssistEnabled, liveJobs, minimumHourlyRate])

  const rankedLiveJobs = useMemo<RankedJobCard[]>(() => {
    const grouped = new Map<string, RankedJobCard>()

    for (const job of liveJobs) {
      const recommendation = recommendApplication(job)
      const analysis = buildJobAnalysis(job, minimumHourlyRate, jobFeedback[jobKey(job)])
      if (smartFilter && analysis.score < LOW_SIGNAL_SCORE_FLOOR) continue
      if (analysis.rate != null && analysis.rate < minimumHourlyRate) continue

      const card = { job, recommendation, analysis }
      const key = analysis.key
      const existing = grouped.get(key)
      if (!existing || card.analysis.score > existing.analysis.score) {
        grouped.set(key, card)
      }
    }

    return [...grouped.values()].sort((a, b) => {
      const scoreDiff = b.analysis.score - a.analysis.score
      if (scoreDiff !== 0) return scoreDiff

      const modeDiff = applyModeRank(a.recommendation.mode) - applyModeRank(b.recommendation.mode)
      if (modeDiff !== 0) return modeDiff

      return ageInDays(a.job.publishedAt) - ageInDays(b.job.publishedAt)
    })
  }, [jobFeedback, liveJobs, minimumHourlyRate, smartFilter])
  const cashNowCards = useMemo(() => rankCashNowJobCards(liveJobs, jobFeedback), [jobFeedback, liveJobs])
  const activeViewTrack = trackForView(activeView)
  const activeLane = laneForTrack(activeViewTrack, 'cash-now')
  const browserFallbackSearches = useMemo(() => buildLaneBrowserSearches(activeLane).slice(0, 8), [activeLane])

  useEffect(() => {
    if (liveJobs.length === 0 || !submittedQuery.trim()) return
    let cancelled = false
    careerOpsApi
      .recordSearchRun({
        lane: activeLane,
        query: submittedQuery,
        sources: selectedSources,
        jobs: liveJobs,
      })
      .then(() => {
        if (!cancelled) {
          void refetchBackendDossiers()
          void refetchSearchRuns()
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeLane, liveJobs, refetchBackendDossiers, refetchSearchRuns, selectedSources, submittedQuery])

  const visibleLiveJobs = useMemo(() => {
    if (activeLane === 'cash-now') {
      return showAllJobs ? cashNowCards : cashNowCards.slice(0, activeLifeMode.searchLimit)
    }
    if (lifeMode === 'unemployed' && !showAllJobs) {
      return rankedLiveJobs.slice(0, activeLifeMode.searchLimit)
    }
    if (lifeMode === 'employed' && !showAllJobs) {
      return rankedLiveJobs.slice(0, activeLifeMode.searchLimit)
    }
    return rankedLiveJobs
  }, [activeLane, activeLifeMode.searchLimit, cashNowCards, lifeMode, rankedLiveJobs, showAllJobs])
  const trackedIds = useMemo(
    () => new Set(dossiers.map(dossier => dossier.source.sourceId).filter(Boolean)),
    [dossiers],
  )

  const stats = useMemo(
    () => [
      { label: 'Opportunity dossiers', value: dossiers.length },
      { label: 'Live openings', value: rankedLiveJobs.length },
      { label: 'Interviews', value: dossiers.filter(dossier => dossier.stage === 'interviewing').length },
      { label: 'Offers', value: dossiers.filter(dossier => dossier.stage === 'offer').length },
    ],
    [dossiers, rankedLiveJobs.length],
  )

  const filteredDossiers = useMemo(
    () =>
      sortDossiersForQueue(
        dossiers.filter(
          dossier =>
            dossierMatchesTrack(dossier, activeTrack) && (stageFilter === 'all' || dossier.stage === stageFilter),
        ),
      ),
    [activeTrack, dossiers, stageFilter],
  )
  const batchCandidateDossiers = useMemo(
    () =>
      filteredDossiers
        .filter(dossier => dossier.stage !== 'archived' && dossier.evaluation.recommendation !== 'skip')
        .slice(0, 12),
    [filteredDossiers],
  )
  const batchPacketChecklist = useMemo(
    () => buildBatchPacketChecklist(careerProfile, batchCandidateDossiers),
    [batchCandidateDossiers, careerProfile],
  )
  const missingBatchPacketItems = useMemo(
    () => batchPacketChecklist.filter(item => !item.ok),
    [batchPacketChecklist],
  )
  const applicationHistory = useMemo(() => applicationHistoryQuery.data ?? [], [applicationHistoryQuery.data])
  const outcomeHistory = useMemo(() => outcomeHistoryQuery.data ?? [], [outcomeHistoryQuery.data])
  const searchRunHistory = useMemo(() => searchRunHistoryQuery.data ?? [], [searchRunHistoryQuery.data])

  const groupedDossiers = useMemo(
    () =>
      STAGES.map(stage => ({
        ...stage,
        dossiers: filteredDossiers.filter(dossier => dossier.stage === stage.id),
      })),
    [filteredDossiers],
  )
  const selectedDossier = useMemo(
    () => filteredDossiers.find(dossier => dossier.id === selectedDossierId) ?? filteredDossiers[0] ?? null,
    [filteredDossiers, selectedDossierId],
  )

  useEffect(() => {
    if (filteredDossiers.length === 0) {
      if (selectedDossierId !== null) setSelectedDossierId(null)
      return
    }

    if (!selectedDossierId || !filteredDossiers.some(dossier => dossier.id === selectedDossierId)) {
      setSelectedDossierId(filteredDossiers[0].id)
    }
  }, [filteredDossiers, selectedDossierId])

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmittedQuery(buildSearchQuery(searchInput, mode))
  }

  const handleQuickSearch = (query: string) => {
    setSearchInput(query)
    setSubmittedQuery(buildSearchQuery(query, mode))
  }

  const handleToggleSource = (source: SearchSourceKey) => {
    setSelectedSources(prev => toggleSource(prev, source))
  }

  const selectTrack = (track: OpportunityTrack) => {
    setActiveTrack(track)
    const config = TRACK_CONFIG[track]
    const nextLane = laneForTrack(track, 'cash-now')
    setSearchInput(config.quickSearches[0])
    setSubmittedQuery(buildSearchQuery(config.quickSearches[0], mode))
    setMinimumHourlyRate(payFloorForLane(careerProfile, nextLane))
    setForm(prev => ({
      ...prev,
      source:
        prev.source === DEFAULT_FORM.source ||
        Object.values(TRACK_CONFIG).some(item => item.intakeSource === prev.source)
          ? config.intakeSource
          : prev.source,
      nextAction:
        prev.nextAction === DEFAULT_FORM.nextAction ||
        Object.values(TRACK_CONFIG).some(item => item.intakeAction === prev.nextAction)
          ? config.intakeAction
          : prev.nextAction,
      tags: track === 'all' ? prev.tags : normalizeTags([prev.tags, track].filter(Boolean).join(', ')).join(', '),
    }))
  }

  const selectView = (view: CareerOpsView) => {
    setActiveView(view)
    const nextTrack = trackForView(view)
    if (nextTrack !== activeTrack) {
      selectTrack(nextTrack)
    }
  }

  const saveCurrentSearch = () => {
    const name = savedSearchName.trim() || `Search: ${searchInput.trim() || 'AI automation'}`
    const nextSearch: SavedSearch = {
      id: createId(),
      name,
      query: searchInput.trim(),
      mode,
      lifeMode,
      sources: selectedSources,
      smartFilter,
      minimumHourlyRate,
      createdAt: new Date().toISOString(),
    }
    hasTouchedSavedSearches.current = true
    setSavedSearches(prev => [nextSearch, ...prev.filter(item => item.name !== name)].slice(0, 10))
    careerOpsApi.saveSearch(nextSearch, laneForTrack(trackForView(activeView))).catch(() => {})
    setSavedSearchName('')
  }

  const applySavedSearch = (search: SavedSearch) => {
    const nextLifeMode = search.lifeMode === 'employed' ? 'employed' : 'unemployed'
    const defaults = LIFE_MODE_CONFIG[nextLifeMode]
    const searchLane = laneForSavedSearch(search)
    setLifeMode(nextLifeMode)
    setSearchInput(search.query || defaults.defaultQuery)
    setMode(search.mode)
    setSelectedSources(search.sources.length > 0 ? search.sources : DEFAULT_SOURCE_KEYS)
    setSmartFilter(search.smartFilter)
    setBrowserAssistEnabled(defaults.browserAssist)
    setStrictReviewFilter(defaults.strictReviewFilter)
    setShowAllJobs(nextLifeMode === 'employed')
    setMinimumHourlyRate(search.minimumHourlyRate)
    setCareerProfile(prev => profileWithLanePayFloor(prev, searchLane, search.minimumHourlyRate))
    setSubmittedQuery(buildSearchQuery(search.query || defaults.defaultQuery, search.mode))
  }

  const removeSavedSearch = (search: SavedSearch) => {
    hasTouchedSavedSearches.current = true
    setSavedSearches(prev => prev.filter(item => item.id !== search.id))
    careerOpsApi.deleteSearch(search.id).catch(() => {})
  }

  const updateSavedSearch = (search: SavedSearch) => {
    const updatedSearch: SavedSearch = {
      ...search,
      query: searchInput.trim() || search.query,
      mode,
      lifeMode,
      sources: selectedSources,
      smartFilter,
      minimumHourlyRate,
    }
    hasTouchedSavedSearches.current = true
    setSavedSearches(prev => prev.map(item => (item.id === search.id ? updatedSearch : item)))
    careerOpsApi.updateSearch(updatedSearch, laneForSavedSearch(updatedSearch)).catch(() => {})
  }

  const applyLifeMode = (nextLifeMode: LifeMode) => {
    const defaults = LIFE_MODE_CONFIG[nextLifeMode]
    setLifeMode(nextLifeMode)
    setSearchInput(defaults.defaultQuery)
    setSubmittedQuery(buildSearchQuery(defaults.defaultQuery, mode))
    setSelectedSources(DEFAULT_SOURCE_KEYS)
    setSmartFilter(defaults.smartFilter)
    setBrowserAssistEnabled(defaults.browserAssist)
    setStrictReviewFilter(defaults.strictReviewFilter)
    setShowAllJobs(nextLifeMode === 'employed')
    setReviewCursor(0)
  }

  const openCurrentGoogleSearch = () => {
    const location =
      mode === 'local-fallback' ? TARGET_PROFILE.location : mode === 'hybrid-ok' ? 'remote hybrid' : 'remote'
    openExternal(buildGoogleSearchUrlFromText(buildSearchQuery(searchInput, mode), location))
  }

  const trackBrowserSearch = (search: { label: string; url: string }) => {
    const location = activeLane === 'cash-now' ? TARGET_PROFILE.location : 'Remote / Fort Myers'
    const dossier = createDossierFromManualIntake({
      company: search.label,
      role: activeLane === 'cash-now' ? 'Fast-hire search target' : 'Career search target',
      location,
      sourceLabel: 'Browser search',
      sourceUrl: search.url,
      description:
        activeLane === 'cash-now'
          ? `${search.label}. Open the search, apply to the best matches today, and follow up same day when a phone or location is listed.`
          : `${search.label}. Open the search, save the strongest roles, and prepare a tailored packet.`,
    })
    upsertDossier({
      ...dossier,
      lane: activeLane,
      nextAction: activeLane === 'cash-now' ? 'Open search and apply today' : 'Open search and save best roles',
      due: 'Today',
      tags: uniqueStrings([...dossier.tags, activeLane, 'browser-search', 'fallback']),
    })
  }

  const startCashNowBlitz = () => {
    const searches = buildLaneBrowserSearches('cash-now').slice(0, 12)
    searches.forEach(search => {
      openExternal(search.url)
      const dossier = createDossierFromManualIntake({
        company: search.label,
        role: 'Fast-hire search target',
        location: TARGET_PROFILE.location,
        sourceLabel: 'Cash-now blitz',
        sourceUrl: search.url,
        description: `${search.label}. Open the best listings, apply today when safe, and follow up same day when a phone or location is listed.`,
      })
      upsertDossier({
        ...dossier,
        lane: 'cash-now',
        nextAction: 'Open search, apply today, call or visit if listed',
        due: 'Today',
        tags: uniqueStrings([...dossier.tags, 'cash-now', 'browser-search', 'cash-now-blitz']),
      })
    })
    setBlitzStatus(`Opened and tracked ${searches.length} cash-now searches for Fort Myers $18/hr+ work.`)
    setActiveTrack('cash-now')
    setActiveView('pipeline')
  }

  const handleProfileChange = (nextProfile: CareerProfile) => {
    setCareerProfile(nextProfile)
    careerOpsApi.putProfile(nextProfile).catch(() => {})
    const activePayFloor = payFloorForLane(nextProfile, activeLane)
    if (minimumHourlyRate !== activePayFloor) {
      setMinimumHourlyRate(activePayFloor)
    }
  }

  const upsertDossier = (dossier: OpportunityDossier) => {
    const nextDossier = applyProfileToDossier(dossier, careerProfile)
    setDossiers(prev => sortDossiersForQueue([nextDossier, ...prev.filter(item => item.id !== nextDossier.id)]))
    careerOpsApi.upsertDossier(nextDossier).catch(() => {})
    setSelectedDossierId(nextDossier.id)
  }

  const trackJob = (job: LiveJob, stage: StageId = 'sourcing') => {
    let nextSelectedId: string | null = null
    setDossiers(prev => {
      const existing = prev.find(dossier => dossier.source.sourceId === job.sourceId)
      if (existing) {
        nextSelectedId = existing.id
        return sortDossiersForQueue(
          prev.map(dossier => {
            if (dossier.source.sourceId !== job.sourceId) return dossier
            const nextDossier: OpportunityDossier = {
              ...dossier,
              stage,
              updatedAt: new Date().toISOString(),
            }
            careerOpsApi.patchDossier(nextDossier).catch(() => {})
            return nextDossier
          }),
        )
      }
      const baseDossier = createDossierFromJob(job)
      const dossier = applyProfileToDossier(
        {
          ...baseDossier,
          stage,
          lane: activeTrack === 'all' ? baseDossier.lane : activeTrack,
          tags: uniqueStrings([...baseDossier.tags, activeTrack === 'all' ? 'engineering' : activeTrack]),
        },
        careerProfile,
      )
      nextSelectedId = dossier.id
      careerOpsApi.upsertDossier(dossier).catch(() => {})
      return sortDossiersForQueue([dossier, ...prev])
    })
    if (nextSelectedId) setSelectedDossierId(nextSelectedId)
  }

  const setFeedbackForJob = (job: LiveJob, feedback: JobFeedback) => {
    const key = jobKey(job)
    setJobFeedback(prev => ({ ...prev, [key]: feedback }))
    if (feedback === 'applied') {
      trackJob(job, 'applied')
    }
  }

  const addManualLead = () => {
    if (!form.company.trim() || !form.role.trim() || !form.notes.trim()) return

    const trackTags = activeTrack === 'all' ? [] : [activeTrack]
    upsertDossier({
      ...createDossierFromManualIntake({
        company: form.company.trim(),
        role: form.role.trim(),
        location: form.location.trim() || 'Remote - US',
        description: form.notes.trim(),
        sourceLabel: form.source.trim() || 'Manual paste',
      }),
      stage: form.stage,
      nextAction: form.nextAction.trim() || 'Score opportunity and tailor assets',
      due: form.due.trim() || 'Today',
      tags: normalizeTags([form.tags, ...trackTags].join(', ')),
      notes: form.notes.trim(),
    })
    setForm({
      ...DEFAULT_FORM,
      source: TRACK_CONFIG[activeTrack].intakeSource,
      nextAction: TRACK_CONFIG[activeTrack].intakeAction,
      tags: activeTrack === 'all' ? '' : activeTrack,
    })
  }

  const advanceLead = (id: string) => {
    setDossiers(prev =>
      sortDossiersForQueue(
        prev.map(dossier => {
          if (dossier.id !== id) return dossier
          const nextDossier: OpportunityDossier = {
            ...dossier,
            stage: nextStage(dossier.stage),
            updatedAt: new Date().toISOString(),
          }
          careerOpsApi.patchDossier(nextDossier).catch(() => {})
          return nextDossier
        }),
      ),
    )
  }

  const archiveLead = (id: string) => {
    setDossiers(prev =>
      sortDossiersForQueue(
        prev.map(dossier => {
          if (dossier.id !== id) return dossier
          const nextDossier: OpportunityDossier = {
            ...dossier,
            stage: 'archived',
            updatedAt: new Date().toISOString(),
          }
          careerOpsApi.patchDossier(nextDossier).catch(() => {})
          return nextDossier
        }),
      ),
    )
  }

  const removeLead = (id: string) => {
    setDossiers(prev => prev.filter(dossier => dossier.id !== id))
    careerOpsApi.deleteDossier(id).catch(() => {})
  }

  const queueForReview = (job: LiveJob, reviewMode: ReviewQueueMode) => {
    setReviewQueue(prev => {
      const existing = prev.find(item => item.url === job.url)
      if (existing) return prev
      return [reviewQueueFromJob(job, reviewMode), ...prev]
    })
  }

  const removeReviewItem = (id: string) => {
    setReviewQueue(prev => prev.filter(item => item.id !== id))
  }

  const sortedReviewQueue = useMemo(() => {
    return [...reviewQueue].sort(
      (a, b) => b.score - a.score || new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime(),
    )
  }, [reviewQueue])

  useEffect(() => {
    if (reviewCursor >= sortedReviewQueue.length) {
      setReviewCursor(0)
    }
  }, [reviewCursor, sortedReviewQueue.length])

  const reviewNext = () => {
    const queue = strictReviewFilter
      ? sortedReviewQueue.filter(item => item.score >= LOW_SIGNAL_SCORE_FLOOR)
      : sortedReviewQueue
    const item = queue[reviewCursor]
    if (!item) return
    openExternal(item.url)
    setReviewCursor(prev => Math.min(prev + 1, Math.max(queue.length - 1, 0)))
  }

  const reminders = useMemo<LeadReminder[]>(() => {
    return sortDossiersForQueue(dossiers)
      .filter(dossier => dossier.stage !== 'archived' && dossier.evaluation.recommendation !== 'skip')
      .filter(dossier => !createdReminderIds.includes(dossier.id))
      .slice(0, 5)
      .map(dossier => ({
        id: dossier.id,
        label: `${dossier.company} · ${dossier.role}`,
        detail: `${dossier.nextAction} (${dossier.due})`,
        stage: dossier.stage,
      }))
  }, [createdReminderIds, dossiers])

  const reminderDueDate = (detail: string): string => {
    const due = detail.toLowerCase()
    const date = new Date()
    if (due.includes('tomorrow')) date.setDate(date.getDate() + 1)
    if (due.includes('next week')) date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 10)
  }

  const createFollowUpReminders = async () => {
    if (reminders.length === 0 || creatingReminders) return
    setCreatingReminders(true)
    setReminderStatus('Creating follow-up reminders...')
    const results = await Promise.allSettled(
      reminders.map(reminder =>
        api.post('/api/reminders', {
          title: `Career Ops: ${reminder.label}`,
          dueDate: reminderDueDate(reminder.detail),
          list: 'Career Ops',
          priority: reminder.stage === 'sourcing' || reminder.stage === 'applied' ? 1 : 5,
          notes: reminder.detail,
        }),
      ),
    )
    const createdIds = reminders
      .filter((_, index) => results[index]?.status === 'fulfilled')
      .map(reminder => reminder.id)
    const failed = results.length - createdIds.length
    if (createdIds.length > 0) {
      setCreatedReminderIds(prev => uniqueStrings([...prev, ...createdIds]))
    }
    setReminderStatus(
      failed > 0
        ? `Created ${createdIds.length} reminders; ${failed} need manual follow-up.`
        : `Created ${createdIds.length} follow-up reminders.`,
    )
    setCreatingReminders(false)
  }

  const conversionStats = useMemo(() => {
    const groups = new Map<string, ConversionStat>()
    for (const dossier of dossiers) {
      const lane = laneForDossier(dossier)
      const source = dossier.source.label || 'Manual'
      const key = `${lane}|${source}|`
      const current = groups.get(key) ?? {
        lane,
        source,
        query: '',
        total: 0,
        applied: 0,
        callbacks: 0,
        interviews: 0,
        offers: 0,
        rejected: 0,
        latestLesson: '',
      }
      current.total += 1
      if (dossier.stage === 'applied' || dossier.stage === 'interviewing' || dossier.stage === 'offer')
        current.applied += 1
      if (dossier.stage === 'interviewing') current.interviews += 1
      if (dossier.stage === 'offer') current.offers += 1
      if (dossier.stage === 'archived' && dossier.evaluation.recommendation === 'skip') current.rejected += 1
      groups.set(key, current)
    }
    for (const outcome of outcomeHistory) {
      const dossier = outcome.dossierId ? dossiers.find(item => item.id === outcome.dossierId) : null
      const lane = (metadataString(outcome.metadata, 'lane') as CareerLane) || (dossier ? laneForDossier(dossier) : 'cash-now')
      const source = metadataString(outcome.metadata, 'source') || dossier?.source.label || 'Outcome'
      const query = metadataString(outcome.metadata, 'query')
      const key = `${lane}|${source}|${query}`
      const current = groups.get(key) ?? {
        lane,
        source,
        query,
        total: 0,
        applied: 0,
        callbacks: 0,
        interviews: 0,
        offers: 0,
        rejected: 0,
        latestLesson: '',
      }
      if (outcome.outcome === 'callback') current.callbacks += 1
      if (outcome.outcome === 'interview') current.interviews += 1
      if (outcome.outcome === 'offer') current.offers += 1
      if (outcome.outcome === 'rejection' || outcome.outcome === 'ignored') current.rejected += 1
      if (outcome.lesson) current.latestLesson = outcome.lesson
      groups.set(key, current)
    }
    return [...groups.values()].sort(
      (a, b) =>
        b.offers - a.offers ||
        b.interviews - a.interviews ||
        b.callbacks - a.callbacks ||
        b.applied - a.applied ||
        b.total - a.total,
    )
  }, [dossiers, outcomeHistory])
  const learnedSavedSearches = useMemo(
    () =>
      savedSearches
        .map((search, index) => ({
          search,
          score: savedSearchLearningScore(search, conversionStats),
          index,
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index),
    [conversionStats, savedSearches],
  )

  const browserReviewItems = useMemo(
    () => sortedReviewQueue.filter(item => !strictReviewFilter || item.score >= LOW_SIGNAL_SCORE_FLOOR).slice(0, 6),
    [sortedReviewQueue, strictReviewFilter],
  )

  const sprintCards = useMemo(
    () =>
      visibleLiveJobs.filter(card => jobFeedback[jobKey(card.job)] !== 'ignored').slice(0, activeLifeMode.searchLimit),
    [activeLifeMode.searchLimit, jobFeedback, visibleLiveJobs],
  )
  const untrackedSprintCards = useMemo(
    () => sprintCards.filter(card => !trackedIds.has(card.job.sourceId)),
    [sprintCards, trackedIds],
  )
  const nextApplicationCard = useMemo(
    () => sprintCards.find(card => jobFeedback[jobKey(card.job)] !== 'applied') ?? sprintCards[0] ?? null,
    [jobFeedback, sprintCards],
  )
  const activeViewConfig = CAREER_OPS_VIEWS.find(view => view.id === activeView) ?? CAREER_OPS_VIEWS[0]
  const showCommand = activeView === 'command'
  const showSearch =
    activeView === 'cash-now' || activeView === 'engineering' || activeView === 'trainer' || activeView === 'command'
  const showPipeline = activeView === 'pipeline' || activeView === 'command' || activeView === 'applications'
  const showIntake = activeView === 'settings'
  const showProfile = activeView === 'packet' || activeView === 'settings'

  const trackTopSprintJobs = () => {
    untrackedSprintCards.slice(0, 5).forEach(card => trackJob(card.job))
    setActiveView('pipeline')
  }

  const queueTopSprintJobs = () => {
    sprintCards.slice(0, 10).forEach(card => queueForReview(card.job, browserAssistEnabled ? 'browser' : 'manual'))
    setActiveView('applications')
  }

  const openNextApplicationPath = () => {
    if (!nextApplicationCard) return
    openExternal(nextApplicationCard.recommendation.url)
    setFeedbackForJob(nextApplicationCard.job, 'applied')
    setActiveView('pipeline')
  }

  const prepareApplyBatch = async () => {
    const ids = batchCandidateDossiers.map(dossier => dossier.id)
    if (ids.length === 0) return
    const missingLabels = missingBatchPacketItems.map(item => item.label)
    setBatchStatus(
      missingLabels.length > 0
        ? `Packet check missing: ${missingLabels.join(', ')}. Preparing approval packet with visible gaps.`
        : 'Preparing approval packet...',
    )
    const batch = await careerOpsApi.prepareBatch(ids, careerProfile).catch(() => null)
    setPreparedBatch(batch)
    setExecutedBatch(null)
    if (batch) void refetchApplications()
    setBatchStatus(
      batch
        ? missingLabels.length > 0
          ? `Batch prepared with packet gaps: ${missingLabels.join(', ')}. Approve only if those gaps are acceptable.`
          : 'Batch prepared. Approve it, then paste the scoped capability to execute.'
        : 'Batch prepare failed.',
    )
    setActiveView('applications')
  }

  const executePreparedBatch = async () => {
    if (!preparedBatch || !batchCapability.trim()) return
    setBatchStatus('Executing approved batch...')
    await careerOpsApi
      .executeBatch(preparedBatch.batchId, batchCapability.trim())
      .then(async result => {
        const tasks = result?.browserTasks ?? []
        setExecutedBatch(result)
        await Promise.allSettled(
          tasks.map(task => {
            const opened = openExternal(task.url)
            return careerOpsApi.recordApplicationEvent({
              applicationId: task.applicationId,
              event: opened ? 'browser_opened' : 'browser_open_blocked',
              url: task.url,
              note: opened
                ? 'Career Ops opened approved public application URL.'
                : 'Career Ops tried to open approved public application URL, but the browser returned no window handle.',
              metadata: {
                dossierId: task.dossierId,
                company: task.company,
                role: task.role,
                fillMode: task.fillMode,
              },
            })
          }),
        )
        void refetchApplications()
        setBatchStatus(
          tasks.length > 0
            ? `Approved batch queued and opened ${tasks.length} browser tasks. Stop on login, captcha, SSN, payment, background-check consent, or unknown sensitive fields.`
            : 'Approved batch queued, but no public URLs were available to open.',
        )
        setBatchCapability('')
      })
      .catch(error => {
        setBatchStatus(error instanceof Error ? error.message : 'Batch execution failed.')
      })
  }

  const recordSelectedOutcome = async (outcome: 'callback' | 'rejection' | 'interview' | 'offer' | 'ignored') => {
    if (!selectedDossier) return
    const nextStageForOutcome: Record<typeof outcome, StageId> = {
      callback: 'interviewing',
      interview: 'interviewing',
      offer: 'offer',
      rejection: 'archived',
      ignored: 'archived',
    }
    const nextDossier: OpportunityDossier = {
      ...selectedDossier,
      stage: nextStageForOutcome[outcome],
      notes: outcomeLesson.trim()
        ? `${selectedDossier.notes}\n\nOutcome lesson: ${outcomeLesson.trim()}`.trim()
        : selectedDossier.notes,
      updatedAt: new Date().toISOString(),
    }
    setDossiers(prev =>
      sortDossiersForQueue(prev.map(dossier => (dossier.id === selectedDossier.id ? nextDossier : dossier))),
    )
    setOutcomeStatus('Recording outcome...')
    await Promise.allSettled([
      careerOpsApi.recordOutcome({
        dossierId: selectedDossier.id,
        outcome,
        lesson: outcomeLesson.trim(),
        metadata: {
          lane: laneForDossier(selectedDossier),
          source: selectedDossier.source.label,
          query: submittedQuery,
        },
      }),
      careerOpsApi.patchDossier(nextDossier),
    ])
    void refetchOutcomes()
    void refetchBackendDossiers()
    setOutcomeStatus(`Outcome recorded: ${outcome}`)
    setOutcomeLesson('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <PageHeader
            defaultTitle="Career Ops"
            defaultSubtitle="Money-now job hunt, career pipeline, trainer growth, and application control"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            <span style={{ ...badgeStyle('sourcing'), background: 'var(--blue-a10)' }}>
              <Briefcase size={11} /> Active search
            </span>
            <span style={{ ...badgeStyle('applied'), background: 'var(--purple-a10)' }}>
              <Sparkle size={11} /> {stats[1].value} live jobs
            </span>
            <span style={{ ...badgeStyle('offer'), background: 'var(--green-a10)' }}>
              <ArrowRight size={11} /> {stats[3].value} offers tracked
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            setDossiers([])
            setPreparedBatch(null)
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Archive size={14} />
          Clear local view
        </button>
      </div>

      <nav
        aria-label="Career Ops navigation"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(138px, 1fr))',
          gap: '8px',
        }}
      >
        {CAREER_OPS_VIEWS.map(view => {
          const active = activeView === view.id
          return (
            <button
              key={view.id}
              type="button"
              onClick={() => selectView(view.id)}
              aria-pressed={active}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: '12px',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: active ? 'var(--accent-a10)' : 'var(--bg-card)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                minHeight: '72px',
              }}
            >
              <span style={{ display: 'block', fontSize: '13px', fontWeight: 800 }}>{view.label}</span>
              <span
                style={{
                  display: 'block',
                  marginTop: '4px',
                  fontSize: '11px',
                  lineHeight: 1.35,
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {view.blurb}
              </span>
            </button>
          )
        })}
      </nav>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          padding: '10px 12px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {activeViewConfig.label} mode
          </div>
          <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>{activeViewConfig.blurb}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <span style={badgeStyle('sourcing')}>{untrackedSprintCards.length} untracked leads</span>
          <span style={badgeStyle('applied')}>{reminders.length} next actions</span>
          <span style={badgeStyle('interviewing')}>{browserReviewItems.length} review items</span>
        </div>
      </div>

      {blitzStatus ? (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '12px',
            border: '1px solid var(--green-a12)',
            background: 'var(--green-a10)',
            color: 'var(--green)',
            fontSize: '12px',
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {blitzStatus}
        </div>
      ) : null}

      {showCommand && (
        <section
          aria-label="Command Center"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
            gap: '12px',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Command Center
                </div>
                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Work the money-now queue first, then batch applications, follow-ups, interviews, and career moves.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={startCashNowBlitz}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--green-a12)',
                    color: 'var(--green)',
                    fontSize: '12px',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Start cash-now blitz
                </button>
                <button
                  type="button"
                  onClick={openNextApplicationPath}
                  disabled={!nextApplicationCard}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: nextApplicationCard ? 'var(--accent)' : 'var(--bg-base)',
                    color: nextApplicationCard ? 'var(--text-on-color)' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: nextApplicationCard ? 'pointer' : 'not-allowed',
                  }}
                >
                  Open next application
                </button>
                <button
                  type="button"
                  onClick={trackTopSprintJobs}
                  disabled={untrackedSprintCards.length === 0}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: untrackedSprintCards.length === 0 ? 'var(--bg-base)' : 'var(--accent-a10)',
                    color: untrackedSprintCards.length === 0 ? 'var(--text-muted)' : 'var(--accent)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: untrackedSprintCards.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Track top 5
                </button>
                <button
                  type="button"
                  onClick={queueTopSprintJobs}
                  disabled={sprintCards.length === 0}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: sprintCards.length === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: sprintCards.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Queue top 10
                </button>
                <button
                  type="button"
                  onClick={prepareApplyBatch}
                  disabled={batchCandidateDossiers.length === 0}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: batchCandidateDossiers.length === 0 ? 'var(--bg-base)' : 'var(--green-a12)',
                    color: batchCandidateDossiers.length === 0 ? 'var(--text-muted)' : 'var(--green)',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: batchCandidateDossiers.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Prepare batch
                </button>
              </div>
            </div>

            {blitzStatus ? (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {blitzStatus}
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
              {sprintCards.length === 0 && !liveJobsQuery.isFetching ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  No command leads yet. Open Cash Now or broaden the current search.
                </div>
              ) : (
                sprintCards.slice(0, 6).map(card => {
                  const { job, recommendation, analysis } = card
                  const tracked = trackedIds.has(job.sourceId)
                  const feedback = jobFeedback[jobKey(job)]
                  return (
                    <article
                      key={`sprint-${job.id}`}
                      style={{
                        padding: '10px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-base)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {job.title}
                          </div>
                          <div style={{ marginTop: '3px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {job.company} · {job.location}
                          </div>
                        </div>
                        <span style={applyModeStyle(recommendation.mode)}>{applyModeLabel(recommendation.mode)}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        <span style={badgeStyle('sourcing')}>Score {analysis.score}</span>
                        <span style={badgeStyle('applied')}>{recommendation.label}</span>
                        <span style={badgeStyle('offer')}>
                          {analysis.rate ? formatHourlyRate(analysis.rate) : 'Pay unknown'}
                        </span>
                        {feedback ? <span style={badgeStyle('interviewing')}>{feedback}</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '9px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openExternal(recommendation.url)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'var(--accent)',
                            color: 'var(--text-on-color)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          Apply path
                        </button>
                        <button
                          type="button"
                          onClick={() => trackJob(job)}
                          disabled={tracked}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: tracked ? 'var(--bg-elevated)' : 'transparent',
                            color: tracked ? 'var(--text-muted)' : 'var(--text-secondary)',
                            cursor: tracked ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          {tracked ? 'Tracked' : 'Track'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedbackForJob(job, 'applied')}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: feedback === 'applied' ? 'var(--green-a12)' : 'transparent',
                            color: feedback === 'applied' ? 'var(--green)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          Applied
                        </button>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Today’s plan
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
              {[
                { label: 'Live matches', value: rankedLiveJobs.length, stage: 'sourcing' as const },
                { label: 'Ready to track', value: untrackedSprintCards.length, stage: 'applied' as const },
                {
                  label: 'In pipeline',
                  value: dossiers.filter(dossier => dossier.stage !== 'archived').length,
                  stage: 'interviewing' as const,
                },
                { label: 'Review queue', value: browserReviewItems.length, stage: 'offer' as const },
              ].map(item => (
                <div
                  key={item.label}
                  style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>{item.value}</div>
                  <div style={{ marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>{item.label}</div>
                  <div style={{ marginTop: '6px' }}>
                    <span style={badgeStyle(item.stage)}>active</span>
                  </div>
                </div>
              ))}
            </div>
            {nextApplicationCard ? (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-base)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>Next best lead</div>
                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {nextApplicationCard.job.company} · {nextApplicationCard.job.title}
                </div>
                <div style={{ marginTop: '7px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {truncate(nextApplicationCard.recommendation.reason, 120)}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {activeView === 'applications' && (
        <section
          aria-label="Application batch builder"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.7fr)',
            gap: '12px',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>Apply batch queue</div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Selects the top non-archived dossiers, generates per-job answers, and creates one scoped approval request.
            </div>
            <div
              aria-label="Batch packet checklist"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '8px',
                marginTop: '10px',
              }}
            >
              {batchPacketChecklist.map(item => (
                <div
                  key={item.label}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: item.ok ? 'var(--bg-base)' : 'var(--red-a08)',
                    fontSize: '11px',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 900 }}>{item.label}</span>
                    <span style={badgeStyle(item.ok ? 'offer' : 'archived')}>{item.ok ? 'Ready' : 'Needs'}</span>
                  </div>
                  <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>{truncate(item.detail, 90)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button
                type="button"
                onClick={prepareApplyBatch}
                disabled={batchCandidateDossiers.length === 0}
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: batchCandidateDossiers.length === 0 ? 'var(--bg-base)' : 'var(--accent)',
                  color: batchCandidateDossiers.length === 0 ? 'var(--text-muted)' : 'var(--text-on-color)',
                  cursor: batchCandidateDossiers.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 800,
                }}
              >
                Prepare approved batch
              </button>
              <button
                type="button"
                onClick={() => setActiveView('pipeline')}
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                Choose dossiers
              </button>
            </div>

            {batchStatus ? (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {batchStatus}
              </div>
            ) : null}

            {preparedBatch ? (
              <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Approval summary
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {preparedBatch.approval.summary}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    <span style={badgeStyle('applied')}>{preparedBatch.approval.action}</span>
                    <span style={badgeStyle('interviewing')}>{preparedBatch.approval.risk} risk</span>
                    <span style={badgeStyle('sourcing')}>{preparedBatch.applications.length} dossiers</span>
                  </div>
                </div>

                {preparedBatch.applications.map(item => (
                  <div
                    key={item.application.id}
                    style={{
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {item.dossier.company} · {item.dossier.role}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.dossier.source.url ?? 'No public URL'} ·{' '}
                      {item.dossier.salaryText ||
                        (item.dossier.estimatedHourlyRate != null
                          ? formatHourlyRate(item.dossier.estimatedHourlyRate)
                          : 'Pay unclear')}
                    </div>
                    <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {String(item.application.preparedAnswers.coverNote ?? '')}
                    </div>
                    <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                      {Object.entries(item.application.preparedAnswers)
                        .slice(0, 6)
                        .map(([key, value]) => (
                          <div
                            key={key}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '110px minmax(0, 1fr)',
                              gap: '8px',
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span style={{ color: 'var(--text-muted)', fontWeight: 800 }}>{key}</span>
                            <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                              {formatPacketValue(value)}
                            </span>
                          </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {(item.application.requiredFields.length
                        ? item.application.requiredFields
                        : ['No extra fields detected']
                      ).map(field => (
                        <span key={field} style={badgeStyle('sourcing')}>
                          {field}
                        </span>
                      ))}
                      {(item.application.riskFlags.length ? item.application.riskFlags : ['No risk flags']).map(
                        flag => (
                          <span key={flag} style={badgeStyle(flag === 'No risk flags' ? 'offer' : 'archived')}>
                            {flag}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>
              Execute approved batch
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Uses a scoped capability. Stops on login, captcha, SSN, payment, background-check consent, or unknown
              sensitive fields.
            </div>
            <input
              aria-label="Batch capability"
              value={batchCapability}
              onChange={event => setBatchCapability(event.target.value)}
              placeholder="Paste approved capability"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: '10px',
                padding: '9px 10px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '12px',
              }}
            />
            <button
              type="button"
              onClick={executePreparedBatch}
              disabled={!preparedBatch || !batchCapability.trim()}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: preparedBatch && batchCapability.trim() ? 'var(--green-a12)' : 'var(--bg-base)',
                color: preparedBatch && batchCapability.trim() ? 'var(--green)' : 'var(--text-muted)',
                cursor: preparedBatch && batchCapability.trim() ? 'pointer' : 'not-allowed',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              Execute approved batch
            </button>
            {executedBatch?.browserTasks.length ? (
              <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                {executedBatch.browserTasks.map(task => (
                  <div
                    key={task.applicationId}
                    style={{
                      padding: '9px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ fontWeight: 900, color: 'var(--text-primary)' }}>
                      {task.company} · {task.role}
                    </div>
                    <div style={{ marginTop: '4px', overflowWrap: 'anywhere' }}>{task.url}</div>
                    <div style={{ marginTop: '4px' }}>Hard stops: {task.hardStops.join(', ')}</div>
                    {task.fillScript ? (
                      <details style={{ marginTop: '8px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 900, color: 'var(--text-primary)' }}>
                          Safe autofill helper
                        </summary>
                        <div style={{ marginTop: '6px', lineHeight: 1.45 }}>
                          {task.fillInstructions ?? 'Fills common safe fields only. Review before submitting.'}
                        </div>
                        <textarea
                          aria-label={`Autofill helper for ${task.company}`}
                          readOnly
                          value={task.fillScript}
                          rows={5}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            marginTop: '6px',
                            padding: '8px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            fontFamily: 'monospace',
                            fontSize: '10px',
                            resize: 'vertical',
                          }}
                        />
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div
              aria-label="Application history"
              style={{
                display: 'grid',
                gap: '8px',
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>
                Application history
              </div>
              {applicationHistory.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  No prepared applications saved yet.
                </div>
              ) : (
                applicationHistory.slice(0, 8).map(application => (
                  <div
                    key={application.id}
                    style={{
                      padding: '8px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ fontWeight: 900, color: 'var(--text-primary)' }}>
                      {applicationDossierLabel(application, dossiers)}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      <span style={badgeStyle(application.status === 'executed' ? 'offer' : 'applied')}>
                        {application.status}
                      </span>
                      <span style={badgeStyle('sourcing')}>{application.submitMode}</span>
                      {application.batchId ? <span style={badgeStyle('interviewing')}>{application.batchId}</span> : null}
                    </div>
                    <div style={{ marginTop: '5px', color: 'var(--text-muted)' }}>
                      Updated {formatDate(application.updatedAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {activeView === 'packet' && (
        <section
          aria-label="Application packet"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.7fr)',
            gap: '12px',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>Application packet</div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Base bullets, proof, pitches, cover notes, common answers, links, availability, and pay floors.
            </div>
            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {(['baseBullets', 'workHistory', 'projectProof'] as const).map(key => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{key}</span>
                  <textarea
                    value={(careerProfile.resumePacket?.[key] ?? []).join('\n')}
                    onChange={event =>
                      handleProfileChange({
                        ...careerProfile,
                        resumePacket: {
                          ...careerProfile.resumePacket!,
                          [key]: event.target.value
                            .split('\n')
                            .map(item => item.trim())
                            .filter(Boolean),
                        },
                      })
                    }
                    rows={3}
                    style={{
                      padding: '9px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      resize: 'vertical',
                    }}
                  />
                </label>
              ))}
              {(['cash-now', 'engineering', 'trainer'] as CareerLane[]).map(lane => (
                <label key={lane} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lane} cover note</span>
                  <textarea
                    value={careerProfile.resumePacket?.coverTemplates?.[lane] ?? ''}
                    onChange={event =>
                      handleProfileChange({
                        ...careerProfile,
                        resumePacket: {
                          ...careerProfile.resumePacket!,
                          coverTemplates: {
                            ...careerProfile.resumePacket!.coverTemplates,
                            [lane]: event.target.value,
                          },
                        },
                      })
                    }
                    rows={2}
                    style={{
                      padding: '9px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      resize: 'vertical',
                    }}
                  />
                </label>
              ))}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Trainer pitch</span>
                <textarea
                  aria-label="Trainer pitch"
                  value={careerProfile.resumePacket?.trainerPitch ?? ''}
                  onChange={event =>
                    handleProfileChange({
                      ...careerProfile,
                      resumePacket: {
                        ...careerProfile.resumePacket!,
                        trainerPitch: event.target.value,
                      },
                    })
                  }
                  rows={2}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    resize: 'vertical',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Engineering pitch</span>
                <textarea
                  aria-label="Engineering pitch"
                  value={careerProfile.resumePacket?.engineeringPitch ?? ''}
                  onChange={event =>
                    handleProfileChange({
                      ...careerProfile,
                      resumePacket: {
                        ...careerProfile.resumePacket!,
                        engineeringPitch: event.target.value,
                      },
                    })
                  }
                  rows={2}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    resize: 'vertical',
                  }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                {(['cash-now', 'engineering', 'trainer'] as CareerLane[]).map(lane => (
                  <label key={lane} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lane} floor</span>
                    <input
                      aria-label={`${lane} pay floor`}
                      type="number"
                      min={0}
                      step={1}
                      value={payFloorForLane(careerProfile, lane)}
                      onChange={event => {
                        const nextFloor = Number(event.target.value || 0)
                        handleProfileChange(profileWithLanePayFloor(careerProfile, lane, nextFloor))
                      }}
                      style={{
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                      }}
                    />
                  </label>
                ))}
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Availability</span>
                <input
                  aria-label="Packet availability"
                  value={careerProfile.availability ?? 'Flexible ASAP'}
                  onChange={event => handleProfileChange({ ...careerProfile, availability: event.target.value })}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                />
              </label>
              {(['availability', 'authorizedToWork', 'desiredPay'] as const).map(key => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{key}</span>
                  <input
                    aria-label={`Common answer ${key}`}
                    value={String(careerProfile.resumePacket?.commonAnswers?.[key] ?? '')}
                    onChange={event =>
                      handleProfileChange({
                        ...careerProfile,
                        resumePacket: {
                          ...careerProfile.resumePacket!,
                          commonAnswers: {
                            ...careerProfile.resumePacket!.commonAnswers,
                            [key]: event.target.value,
                          },
                        },
                      })
                    }
                    style={{
                      padding: '9px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                </label>
              ))}
              {(['linkedin', 'github', 'portfolio', 'trainingProfile'] as const).map(key => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{key}</span>
                  <input
                    aria-label={`Packet link ${key}`}
                    value={careerProfile.links?.[key] ?? ''}
                    onChange={event =>
                      handleProfileChange({
                        ...careerProfile,
                        links: {
                          ...(careerProfile.links ?? {}),
                          [key]: event.target.value,
                        },
                      })
                    }
                    style={{
                      padding: '9px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>Packet checklist</div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              {[
                { label: 'Cash-now floor', value: `$${careerProfile.payFloors?.['cash-now'] ?? 18}/hr` },
                { label: 'Availability', value: careerProfile.availability ?? 'Flexible ASAP' },
                { label: 'Links saved', value: Object.keys(careerProfile.links ?? {}).length },
                { label: 'Base bullets', value: careerProfile.resumePacket?.baseBullets.length ?? 0 },
                { label: 'Project proof', value: careerProfile.resumePacket?.projectProof.length ?? 0 },
              ].map(item => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-base)',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {(activeView === 'command' || activeView === 'pipeline' || activeView === 'applications') && (
        <section
          aria-label="Learning loop"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.8fr)',
            gap: '12px',
            alignItems: 'start',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>Learning loop</div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Capture the result, lesson, source, and lane so future queues push what works.
            </div>
            <textarea
              aria-label="Outcome lesson"
              value={outcomeLesson}
              onChange={event => setOutcomeLesson(event.target.value)}
              placeholder="What happened? Pay, callback quality, why rejected, what to improve next."
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: '10px',
                padding: '9px 10px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {(['callback', 'interview', 'offer', 'rejection', 'ignored'] as const).map(outcome => (
                <button
                  key={outcome}
                  type="button"
                  onClick={() => recordSelectedOutcome(outcome)}
                  disabled={!selectedDossier}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: selectedDossier ? 'var(--accent-a10)' : 'var(--bg-base)',
                    color: selectedDossier ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: selectedDossier ? 'pointer' : 'not-allowed',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {outcome}
                </button>
              ))}
            </div>
            {outcomeStatus ? (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>{outcomeStatus}</div>
            ) : null}
            <div aria-label="Outcome history" style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              {outcomeHistory.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  Recent outcomes appear here after callbacks, interviews, offers, rejections, or ignored leads.
                </div>
              ) : (
                outcomeHistory.slice(0, 5).map(outcome => (
                  <div
                    key={outcome.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 900 }}>
                        {outcomeDossierLabel(outcome, dossiers)}
                      </span>
                      <span style={badgeStyle(outcome.outcome === 'offer' ? 'offer' : 'interviewing')}>
                        {outcome.outcome}
                      </span>
                    </div>
                    {outcome.lesson ? (
                      <div style={{ marginTop: '5px', lineHeight: 1.45 }}>{truncate(outcome.lesson, 120)}</div>
                    ) : null}
                    <div style={{ marginTop: '5px', color: 'var(--text-muted)' }}>{formatDate(outcome.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>
              Conversion by lane/source
            </div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              {conversionStats.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  Stats appear once dossiers and outcomes exist.
                </div>
              ) : (
                conversionStats.slice(0, 5).map(stat => (
                  <div
                    key={`${stat.lane}-${stat.source}-${stat.query || 'dossiers'}`}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {stat.lane} · {stat.source}
                      </span>
                      <span style={badgeStyle('applied')}>{stat.total} total</span>
                    </div>
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={badgeStyle('sourcing')}>{stat.applied} applied</span>
                      <span style={badgeStyle('interviewing')}>{stat.callbacks} callbacks</span>
                      <span style={badgeStyle('interviewing')}>{stat.interviews} interviews</span>
                      <span style={badgeStyle('offer')}>{stat.offers} offers</span>
                      <span style={badgeStyle('archived')}>{stat.rejected} rejected</span>
                    </div>
                    {stat.query ? (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Query: {truncate(stat.query, 90)}
                      </div>
                    ) : null}
                    {stat.latestLesson ? (
                      <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Lesson: {truncate(stat.latestLesson, 100)}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(340px, 1fr)',
          gap: '12px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <div
            style={{
              display: showSearch ? 'block' : 'none',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                marginBottom: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FunnelSimple size={14} style={{ color: 'var(--accent)' }} />
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Find live jobs
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(
                  Object.entries(TRACK_CONFIG) as Array<[OpportunityTrack, (typeof TRACK_CONFIG)[OpportunityTrack]]>
                ).map(([track, config]) => {
                  const active = activeTrack === track
                  return (
                    <button
                      key={track}
                      type="button"
                      title={config.blurb}
                      onClick={() => selectTrack(track)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: active ? 'var(--accent-a12)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: active ? 800 : 600,
                        cursor: 'pointer',
                      }}
                    >
                      {config.label}
                    </button>
                  )
                })}
              </div>
              <form
                onSubmit={handleSearch}
                style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: '240px', flex: '1 1 260px' }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <MagnifyingGlass
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                    }}
                  />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder={
                      activeTrack === 'trainer'
                        ? 'Search content, offers, influencers, or leads'
                        : 'Search by title, keyword, or company'
                    }
                    aria-label="Search live job openings"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px 10px 34px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--accent)',
                    color: 'var(--text-on-color)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={openCurrentGoogleSearch}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Google it
                </button>
              </form>
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.4, marginBottom: '8px' }}>
              {TRACK_CONFIG[activeTrack].blurb}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              {browserFallbackSearches.map(search => (
                <button
                  key={search.label}
                  type="button"
                  onClick={() => openExternal(search.url)}
                  style={{
                    padding: '6px 9px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: activeLane === 'cash-now' ? 'var(--green-a12)' : 'transparent',
                    color: activeLane === 'cash-now' ? 'var(--green)' : 'var(--text-secondary)',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {search.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              {(Object.entries(LIFE_MODE_CONFIG) as Array<[LifeMode, (typeof LIFE_MODE_CONFIG)[LifeMode]]>).map(
                ([value, config]) => {
                  const active = lifeMode === value
                  return (
                    <button
                      key={value}
                      type="button"
                      title={config.blurb}
                      onClick={() => applyLifeMode(value)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '999px',
                        border: '1px solid var(--border)',
                        background: active ? 'var(--accent-a12)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {config.label}
                    </button>
                  )
                },
              )}
              {WORK_MODES.map(option => (
                <button
                  key={option.id}
                  type="button"
                  title={option.description}
                  onClick={() => setMode(option.id)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: mode === option.id ? 'var(--accent-a12)' : 'transparent',
                    color: mode === option.id ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              ))}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                }}
              >
                Floor
                <input
                  type="number"
                  aria-label="Minimum hourly rate"
                  min={15}
                  step={1}
                  value={minimumHourlyRate}
                  onChange={e => {
                    const nextPayFloor = Number(e.target.value) || careerProfile.payFloor
                    handleProfileChange(profileWithLanePayFloor(careerProfile, activeLane, nextPayFloor))
                  }}
                  style={{
                    width: '72px',
                    padding: '7px 8px',
                    borderRadius: '9px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setSmartFilter(prev => !prev)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: smartFilter ? 'var(--green-a12)' : 'transparent',
                  color: smartFilter ? 'var(--green)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Smart {smartFilter ? 'on' : 'off'}
              </button>
              <button
                type="button"
                onClick={() => setBrowserAssistEnabled(prev => !prev)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: browserAssistEnabled ? 'var(--accent-a12)' : 'transparent',
                  color: browserAssistEnabled ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Browser {browserAssistEnabled ? 'on' : 'off'}
              </button>
            </div>

            <details style={{ marginTop: '8px' }}>
              <summary style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                Sources and saved searches
              </summary>
              <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {SOURCE_OPTIONS.map(option => {
                    const active = selectedSources.includes(option.id)
                    return (
                      <button
                        key={option.id}
                        type="button"
                        title={option.description}
                        onClick={() => handleToggleSource(option.id)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '999px',
                          border: '1px solid var(--border)',
                          background: active ? 'var(--accent-a12)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setSelectedSources(DEFAULT_SOURCE_KEYS)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Use all reputable
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' }}>
                  <input
                    aria-label="Saved search name"
                    value={savedSearchName}
                    onChange={e => setSavedSearchName(e.target.value)}
                    placeholder="Name this search"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={saveCurrentSearch}
                    style={{
                      padding: '8px 11px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--accent-a10)',
                      color: 'var(--accent)',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>
                {savedSearches.length > 0 && (
                  <div aria-label="Learned saved searches" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {learnedSavedSearches.slice(0, 4).map(({ search, score }) => (
                      <span
                        key={search.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          overflow: 'hidden',
                          borderRadius: '999px',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => applySavedSearch(search)}
                          style={{
                            padding: '7px 9px 7px 10px',
                            border: 0,
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          {search.name}
                          {score !== 0 ? (
                            <span style={{ marginLeft: '6px', color: score > 0 ? 'var(--green)' : 'var(--red)' }}>
                              Learning {score > 0 ? `+${score}` : score}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove saved search ${search.name}`}
                          title={`Remove ${search.name}`}
                          onClick={() => removeSavedSearch(search)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            border: 0,
                            borderLeft: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Update saved search ${search.name}`}
                          title={`Update ${search.name} with current filters`}
                          onClick={() => updateSavedSearch(search)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            border: 0,
                            borderLeft: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          <PencilSimple size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div aria-label="Search run history" style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-primary)' }}>
                    Recent search runs
                  </div>
                  {searchRunHistory.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45 }}>
                      Run a search to see source, result, dedupe, and dossier creation history.
                    </div>
                  ) : (
                    searchRunHistory.slice(0, 5).map(run => (
                      <div
                        key={run.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-base)',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <div
                          style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}
                        >
                          <span style={{ color: 'var(--text-primary)', fontWeight: 900 }}>{run.query}</span>
                          <span style={badgeStyle(run.lane === 'cash-now' ? 'offer' : 'sourcing')}>{run.lane}</span>
                        </div>
                        <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          <span style={badgeStyle('sourcing')}>{run.resultCount} results</span>
                          <span style={badgeStyle('applied')}>{run.createdDossierIds.length} tracked</span>
                          <span style={badgeStyle('interviewing')}>{run.dedupeFingerprints.length} deduped</span>
                        </div>
                        <div style={{ marginTop: '5px', color: 'var(--text-muted)' }}>
                          {searchRunSourceLabel(run)} · {formatDate(run.createdAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </details>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {TRACK_CONFIG[activeTrack].quickSearches.map(query => (
                <button
                  key={query}
                  onClick={() => handleQuickSearch(query)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: submittedQuery === query ? 'var(--accent-a12)' : 'transparent',
                    color: submittedQuery === query ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {query}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginTop: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {liveJobsQuery.isFetching
                  ? 'Searching live openings...'
                  : submittedQuery
                    ? lifeMode === 'unemployed' && !showAllJobs
                      ? `Showing top ${visibleLiveJobs.length} of ${rankedLiveJobs.length} results for "${submittedQuery}"`
                      : `Showing ${visibleLiveJobs.length} results for "${submittedQuery}"`
                    : lifeMode === 'unemployed' && !showAllJobs
                      ? `Showing top ${visibleLiveJobs.length} of ${rankedLiveJobs.length} recent remote openings`
                      : `Showing ${visibleLiveJobs.length} recent remote openings`}
              </div>
              <button
                onClick={() => liveJobsQuery.refetch()}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          <div style={{ display: showSearch ? 'flex' : 'none', flexDirection: 'column', gap: '8px' }}>
            {liveJobsQuery.error ? (
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Live feeds paused
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {liveJobsQuery.error instanceof Error
                    ? liveJobsQuery.error.message
                    : 'The job search service returned an error.'}
                </div>
                <div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
                  {browserFallbackSearches.map(search => (
                    <div
                      key={search.url}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        flexWrap: 'wrap',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '10px',
                        background: 'var(--bg-base)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {search.label}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openExternal(search.url)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'var(--accent)',
                            color: 'var(--text-on-color)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          <ArrowSquareOut size={13} />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => trackBrowserSearch(search)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          <Plus size={13} />
                          Track
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : visibleLiveJobs.length === 0 && !liveJobsQuery.isFetching ? (
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px',
                }}
              >
                <EmptyState
                  icon={MagnifyingGlass}
                  title="No live jobs found"
                  description="Try a broader query or use one of the quick searches above."
                />
                <div style={{ display: 'grid', gap: '8px', marginTop: '14px' }}>
                  {browserFallbackSearches.map(search => (
                    <div
                      key={search.url}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        flexWrap: 'wrap',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '10px',
                        background: 'var(--bg-base)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {search.label}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openExternal(search.url)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'var(--accent)',
                            color: 'var(--text-on-color)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          <ArrowSquareOut size={13} />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => trackBrowserSearch(search)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          <Plus size={13} />
                          Track
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              visibleLiveJobs.map(card => {
                const { job, recommendation, analysis } = card
                const tracked = trackedIds.has(job.sourceId)
                const rate = analysis.rate ?? estimateHourlyRate(job.salary)
                const actionLabel = applyModeLabel(recommendation.mode)
                const actionStyle = applyModeStyle(recommendation.mode)
                return (
                  <article
                    key={job.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      padding: '12px',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}
                        >
                          {job.title}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            marginTop: '4px',
                            color: 'var(--text-secondary)',
                            fontSize: '12px',
                          }}
                        >
                          <span>{job.company}</span>
                          <span>·</span>
                          <span>{job.category}</span>
                        </div>
                      </div>
                      <span style={badgeStyle('sourcing')}>{job.source}</span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      <span style={badgeStyle('sourcing')}>
                        <MapPin size={11} /> {job.location}
                      </span>
                      <span style={badgeStyle('applied')}>
                        <Clock size={11} /> {formatDate(job.publishedAt)}
                      </span>
                      <span style={badgeStyle('offer')}>
                        <Briefcase size={11} /> {job.jobType}
                      </span>
                      <span style={badgeStyle('interviewing')}>
                        <CurrencyDollar size={11} /> {rate ? formatHourlyRate(rate) : 'Salary not listed'}
                      </span>
                    </div>

                    <div
                      style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: '8px' }}
                    >
                      {truncate(job.summary, 150)}
                    </div>

                    <div
                      style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={actionStyle}>{actionLabel}</span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {recommendation.label}
                          </span>
                        </div>
                        <div
                          style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}
                        >
                          {truncate(recommendation.reason, 120)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: '1 1 220px' }}>
                        {uniqueStrings([...analysis.signals, ...analysis.reasons])
                          .slice(0, 4)
                          .map(signal => (
                            <span
                              key={signal}
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                borderRadius: '999px',
                                padding: '3px 8px',
                              }}
                            >
                              {signal}
                            </span>
                          ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => openExternal(recommendation.url)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'var(--accent)',
                          color: 'var(--text-on-color)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        <ArrowSquareOut size={13} />
                        Open
                      </button>
                      <button
                        onClick={() => trackJob(job)}
                        disabled={tracked}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: tracked ? 'var(--bg-base)' : 'transparent',
                          color: tracked ? 'var(--text-muted)' : 'var(--text-secondary)',
                          cursor: tracked ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        {tracked ? <CheckCircle size={13} /> : <Plus size={13} />}
                        {tracked ? 'Pinged' : recommendation.mode === 'review' ? 'Ping me' : 'Track'}
                      </button>
                      <button
                        onClick={() => queueForReview(job, browserAssistEnabled ? 'browser' : 'manual')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: browserAssistEnabled ? 'var(--accent-a10)' : 'transparent',
                          color: browserAssistEnabled ? 'var(--accent)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        {browserAssistEnabled ? 'Queue browser review' : 'Queue later'}
                      </button>
                      <button
                        onClick={() => setFeedbackForJob(job, 'good')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: jobFeedback[jobKey(job)] === 'good' ? 'var(--green-a12)' : 'transparent',
                          color: jobFeedback[jobKey(job)] === 'good' ? 'var(--green)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Good
                      </button>
                      <button
                        onClick={() => setFeedbackForJob(job, 'applied')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: jobFeedback[jobKey(job)] === 'applied' ? 'var(--accent-a12)' : 'transparent',
                          color: jobFeedback[jobKey(job)] === 'applied' ? 'var(--accent)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Applied
                      </button>
                      <button
                        onClick={() => setFeedbackForJob(job, 'ignored')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: jobFeedback[jobKey(job)] === 'ignored' ? 'var(--bg-elevated)' : 'transparent',
                          color:
                            jobFeedback[jobKey(job)] === 'ignored' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Ignore
                      </button>
                      <button
                        onClick={() => openExternal(buildGoogleSearchUrl(job))}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Google
                      </button>
                    </div>
                  </article>
                )
              })
            )}
            {lifeMode === 'unemployed' && !showAllJobs && rankedLiveJobs.length > visibleLiveJobs.length ? (
              <button
                type="button"
                onClick={() => setShowAllJobs(true)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'var(--accent-a10)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                Show more jobs
              </button>
            ) : null}
          </div>

          <div style={{ display: showIntake ? 'block' : 'none' }}>
            <section
              aria-label="Career Ops sync status"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>Sync status</div>
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Local SQLite stays primary. Supabase mirrors only when configured and the career tables exist.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                <span style={badgeStyle('offer')}>
                  SQLite {Object.values(syncStatusQuery.data?.sqliteTables ?? {}).every(Boolean) ? 'ready' : 'checking'}
                </span>
                <span
                  style={badgeStyle(
                    syncStatusQuery.data?.supabase.careerTablesDetected
                      ? 'offer'
                      : syncStatusQuery.data?.supabase.configured
                        ? 'archived'
                        : 'sourcing',
                  )}
                >
                  Supabase {syncStatusQuery.data?.supabase.status ?? 'checking'}
                </span>
                {typeof syncStatusQuery.data?.supabase.httpStatus === 'number' ? (
                  <span style={badgeStyle('sourcing')}>HTTP {syncStatusQuery.data.supabase.httpStatus}</span>
                ) : null}
              </div>
              {syncStatusQuery.data?.supabase.status === 'career_tables_missing' &&
              syncStatusQuery.data.supabase.missingTables?.length ? (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Missing Supabase tables: {syncStatusQuery.data.supabase.missingTables.join(', ')}. Apply{' '}
                  <code>{syncStatusQuery.data.migration?.path ?? 'supabase/migrations/20260512000000_career_ops.sql'}</code>{' '}
                  with <code>{syncStatusQuery.data.migration?.applyCommand ?? 'npm run career:apply-supabase'}</code>, then{' '}
                  <code>{syncStatusQuery.data.migration?.checkCommand ?? 'npm run career:check'}</code>. If only npm is
                  available, set <code>CAREER_OPS_ALLOW_NPX_SUPABASE=1</code> with a DB URL before applying. If the DB URL is
                  in Bitwarden, set <code>CAREER_OPS_SUPABASE_DB_URL_BW_ITEM</code> and export <code>BW_SESSION</code>. If
                  using protected postgres-meta, set <code>CAREER_OPS_SUPABASE_META_URL</code> and{' '}
                  <code>CAREER_OPS_SUPABASE_META_TOKEN</code>.
                </div>
              ) : null}
            </section>
            <IntakePanel form={form} onChange={setForm} onSubmit={addManualLead} />
          </div>

          <div style={{ display: showPipeline ? 'block' : 'none' }}>
            <ActionQueue
              reminders={reminders}
              onCreateReminders={createFollowUpReminders}
              reminderStatus={reminderStatus}
              creatingReminders={creatingReminders}
            />
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <div style={{ display: showPipeline || showIntake || showProfile ? 'block' : 'none' }}>
            <DossierPanel dossier={selectedDossier} />
          </div>

          <div style={{ display: showProfile ? 'block' : 'none' }}>
            <ProfilePanel profile={careerProfile} selectedDossier={selectedDossier} onChange={handleProfileChange} />
          </div>

          <div style={{ display: showPipeline ? 'block' : 'none' }}>
            <OpportunityQueue
              groupedDossiers={groupedDossiers}
              stageFilter={stageFilter}
              selectedId={selectedDossier?.id ?? null}
              onStageFilterChange={setStageFilter}
              onSelect={setSelectedDossierId}
              onAdvance={advanceLead}
              onArchive={archiveLead}
              onRemove={removeLead}
            />
          </div>

          <div
            style={{
              display: showSearch ? 'block' : 'none',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '12px',
              maxHeight: '40vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                marginBottom: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                }}
              >
                Browser review queue
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setStrictReviewFilter(prev => !prev)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: strictReviewFilter ? 'var(--green-a12)' : 'transparent',
                    color: strictReviewFilter ? 'var(--green)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Strict filter {strictReviewFilter ? 'on' : 'off'}
                </button>
                <button
                  type="button"
                  onClick={reviewNext}
                  disabled={browserReviewItems.length === 0}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: browserReviewItems.length === 0 ? 'var(--bg-base)' : 'var(--accent-a12)',
                    color: browserReviewItems.length === 0 ? 'var(--text-muted)' : 'var(--accent)',
                    fontSize: '12px',
                    cursor: browserReviewItems.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Review now
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {browserReviewItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  Queue jobs here when you want a human-in-the-loop browser pass instead of only launcher links.
                </div>
              ) : (
                browserReviewItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {item.role}
                        </div>
                        <div style={{ marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {item.company} · {item.source}
                        </div>
                        <div style={{ marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          Score {item.score} · {formatDate(item.queuedAt)}
                        </div>
                        {item.reason && (
                          <div
                            style={{
                              marginTop: '4px',
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.5,
                            }}
                          >
                            {item.reason}
                          </div>
                        )}
                        {item.signals.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {item.signals.slice(0, 3).map(signal => (
                              <span
                                key={signal}
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '999px',
                                  padding: '3px 8px',
                                }}
                              >
                                {signal}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span style={badgeStyle('applied')}>{item.mode}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => openExternal(item.url)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'var(--accent-a10)',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => removeReviewItem(item.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px 10px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
