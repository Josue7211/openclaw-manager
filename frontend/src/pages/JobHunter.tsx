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
} from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { OpportunityQueue } from './career-ops/OpportunityQueue'
import { DossierPanel } from './career-ops/DossierPanel'
import { ActionQueue } from './career-ops/ActionQueue'
import { ProfilePanel } from './career-ops/ProfilePanel'
import { IntakePanel } from './career-ops/IntakePanel'
import type {
  CareerProfile,
  JobFeedback,
  JobForm,
  JobSearchResponse,
  LifeMode,
  LiveJob,
  OpportunityDossier,
  RankedJobCard,
  ReviewQueueItem,
  ReviewQueueMode,
  SavedSearch,
  SearchSourceKey,
  StageId,
  WorkMode,
  LeadReminder,
} from './job-hunter-types'
import {
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
} from './job-hunter-domain'

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

type OpportunityTrack = 'all' | 'engineering' | 'trainer'

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

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function applyProfileToDossier(dossier: OpportunityDossier, profile: CareerProfile): OpportunityDossier {
  return generateDossierAssets(evaluateDossier(dossier, profile), profile)
}

function initializeDossiers(profile: CareerProfile): OpportunityDossier[] {
  const storedDossiers = sortDossiersForQueue(loadDossiers())
  if (storedDossiers.length > 0) return storedDossiers

  const legacyLeads = loadTrackedLeads()
    .map(migrateLeadToDossier)
    .map(dossier => applyProfileToDossier(dossier, profile))

  return sortDossiersForQueue(legacyLeads)
}

function dossierMatchesTrack(dossier: OpportunityDossier, track: OpportunityTrack): boolean {
  if (track === 'all') return true
  const tags = dossier.tags.map(tag => tag.toLowerCase())
  const isTrainer = tags.some(tag =>
    ['trainer', 'personal-trainer', 'online-coaching', 'socials', 'influencer'].includes(tag),
  )
  if (track === 'trainer') return isTrainer
  return tags.includes('engineering') || !isTrainer
}

export default function JobHunterPage() {
  const [careerProfile, setCareerProfile] = useState<CareerProfile>(() => loadCareerProfile())
  const [dossiers, setDossiers] = useState<OpportunityDossier[]>(() => initializeDossiers(loadCareerProfile()))
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null)
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>(() => loadReviewQueue())
  const [jobFeedback, setJobFeedback] = useState<Record<string, JobFeedback>>(() => loadFeedback())
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => loadSavedSearches())
  const [lifeMode, setLifeMode] = useState<LifeMode>(() => loadLifeMode())
  const [reviewCursor, setReviewCursor] = useState(0)
  const [stageFilter, setStageFilter] = useState<StageId | 'all'>('all')
  const initialLifeMode = loadLifeMode()
  const [searchInput, setSearchInput] = useState(LIFE_MODE_CONFIG[initialLifeMode].defaultQuery)
  const [savedSearchName, setSavedSearchName] = useState('')
  const [mode, setMode] = useState<WorkMode>('remote-first')
  const [submittedQuery, setSubmittedQuery] = useState(
    buildSearchQuery(LIFE_MODE_CONFIG[initialLifeMode].defaultQuery, 'remote-first'),
  )
  const [selectedSources, setSelectedSources] = useState<SearchSourceKey[]>(DEFAULT_SOURCE_KEYS)
  const [smartFilter, setSmartFilter] = useState(LIFE_MODE_CONFIG[initialLifeMode].smartFilter)
  const [browserAssistEnabled, setBrowserAssistEnabled] = useState(LIFE_MODE_CONFIG[initialLifeMode].browserAssist)
  const [strictReviewFilter, setStrictReviewFilter] = useState(LIFE_MODE_CONFIG[initialLifeMode].strictReviewFilter)
  const [minimumHourlyRate, setMinimumHourlyRate] = useState(() => loadCareerProfile().payFloor)
  const [showAllJobs, setShowAllJobs] = useState(false)
  const [activeTrack, setActiveTrack] = useState<OpportunityTrack>('all')
  const [form, setForm] = useState<JobForm>(DEFAULT_FORM)
  const hasAppliedProfileEdit = useRef(false)

  const trackedLeads = useMemo(() => dossiers.map(dossierToTrackedLead), [dossiers])

  useEffect(() => {
    if (typeof window === 'undefined') return
    saveDossiers(dossiers)
    localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(trackedLeads))
  }, [dossiers, trackedLeads])

  useEffect(() => {
    if (typeof window === 'undefined') return
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
  const visibleLiveJobs = useMemo(() => {
    if (lifeMode === 'unemployed' && !showAllJobs) {
      return rankedLiveJobs.slice(0, activeLifeMode.searchLimit)
    }
    if (lifeMode === 'employed' && !showAllJobs) {
      return rankedLiveJobs.slice(0, activeLifeMode.searchLimit)
    }
    return rankedLiveJobs
  }, [activeLifeMode.searchLimit, lifeMode, rankedLiveJobs, showAllJobs])
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
    setSearchInput(config.quickSearches[0])
    setSubmittedQuery(buildSearchQuery(config.quickSearches[0], mode))
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
    setSavedSearches(prev => [nextSearch, ...prev.filter(item => item.name !== name)].slice(0, 10))
    setSavedSearchName('')
  }

  const applySavedSearch = (search: SavedSearch) => {
    const nextLifeMode = search.lifeMode === 'employed' ? 'employed' : 'unemployed'
    const defaults = LIFE_MODE_CONFIG[nextLifeMode]
    setLifeMode(nextLifeMode)
    setSearchInput(search.query || defaults.defaultQuery)
    setMode(search.mode)
    setSelectedSources(search.sources.length > 0 ? search.sources : DEFAULT_SOURCE_KEYS)
    setSmartFilter(search.smartFilter)
    setBrowserAssistEnabled(defaults.browserAssist)
    setStrictReviewFilter(defaults.strictReviewFilter)
    setShowAllJobs(nextLifeMode === 'employed')
    setMinimumHourlyRate(search.minimumHourlyRate)
    setCareerProfile(prev => ({ ...prev, payFloor: search.minimumHourlyRate }))
    setSubmittedQuery(buildSearchQuery(search.query || defaults.defaultQuery, search.mode))
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

  const handleProfileChange = (nextProfile: CareerProfile) => {
    setCareerProfile(nextProfile)
    if (minimumHourlyRate !== nextProfile.payFloor) {
      setMinimumHourlyRate(nextProfile.payFloor)
    }
  }

  const upsertDossier = (dossier: OpportunityDossier) => {
    const nextDossier = applyProfileToDossier(dossier, careerProfile)
    setDossiers(prev => sortDossiersForQueue([nextDossier, ...prev.filter(item => item.id !== nextDossier.id)]))
    setSelectedDossierId(nextDossier.id)
  }

  const trackJob = (job: LiveJob, stage: StageId = 'sourcing') => {
    let nextSelectedId: string | null = null
    setDossiers(prev => {
      const existing = prev.find(dossier => dossier.source.sourceId === job.sourceId)
      if (existing) {
        nextSelectedId = existing.id
        return sortDossiersForQueue(
          prev.map(dossier =>
            dossier.source.sourceId === job.sourceId
              ? {
                  ...dossier,
                  stage,
                  updatedAt: new Date().toISOString(),
                }
              : dossier,
          ),
        )
      }
      const baseDossier = createDossierFromJob(job)
      const dossier = applyProfileToDossier(
        {
          ...baseDossier,
          stage,
          tags: uniqueStrings([...baseDossier.tags, 'engineering']),
        },
        careerProfile,
      )
      nextSelectedId = dossier.id
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
        prev.map(dossier =>
          dossier.id === id
            ? {
                ...dossier,
                stage: nextStage(dossier.stage),
                updatedAt: new Date().toISOString(),
              }
            : dossier,
        ),
      ),
    )
  }

  const archiveLead = (id: string) => {
    setDossiers(prev =>
      sortDossiersForQueue(
        prev.map(dossier =>
          dossier.id === id
            ? {
                ...dossier,
                stage: 'archived',
                updatedAt: new Date().toISOString(),
              }
            : dossier,
        ),
      ),
    )
  }

  const removeLead = (id: string) => {
    setDossiers(prev => prev.filter(dossier => dossier.id !== id))
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
      .slice(0, 5)
      .map(dossier => ({
        id: dossier.id,
        label: `${dossier.company} · ${dossier.role}`,
        detail: `${dossier.nextAction} (${dossier.due})`,
        stage: dossier.stage,
      }))
  }, [dossiers])

  const browserReviewItems = useMemo(
    () => sortedReviewQueue.filter(item => !strictReviewFilter || item.score >= LOW_SIGNAL_SCORE_FLOOR).slice(0, 6),
    [sortedReviewQueue, strictReviewFilter],
  )

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
            defaultSubtitle="Opportunity dossiers, live openings, and follow-up control"
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
          onClick={() => setDossiers([])}
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
          Clear dossiers
        </button>
      </div>

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
                    setMinimumHourlyRate(nextPayFloor)
                    setCareerProfile(prev => ({ ...prev, payFloor: nextPayFloor }))
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {savedSearches.slice(0, 4).map(search => (
                      <button
                        key={search.id}
                        type="button"
                        onClick={() => applySavedSearch(search)}
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
                        {search.name}
                      </button>
                    ))}
                  </div>
                )}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  Could not load live jobs
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {liveJobsQuery.error instanceof Error
                    ? liveJobsQuery.error.message
                    : 'The job search service returned an error.'}
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

          <IntakePanel form={form} onChange={setForm} onSubmit={addManualLead} />

          <ActionQueue reminders={reminders} />
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <DossierPanel dossier={selectedDossier} />

          <ProfilePanel profile={careerProfile} selectedDossier={selectedDossier} onChange={handleProfileChange} />

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

          <div
            style={{
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
