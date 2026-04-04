import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import type {
  JobFeedback,
  JobForm,
  JobPriority,
  JobSearchResponse,
  LifeMode,
  LiveJob,
  RankedJobCard,
  ReviewQueueItem,
  ReviewQueueMode,
  SavedSearch,
  SearchSourceKey,
  StageId,
  TrackedLead,
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
  leadFromJob,
  reviewQueueFromJob,
  shouldAutoQueueBrowserReview,
  normalizeTags,
  buildSearchQuery,
  serializeSources,
  toggleSource,
  estimateHourlyRate,
  formatHourlyRate,
  buildLinkedInSearchUrl,
  buildIndeedSearchUrl,
  buildGoogleSearchUrl,
  buildGoogleSearchUrlFromText,
  recommendApplication,
  applyModeLabel,
  applyModeStyle,
  applyModeRank,
} from './job-hunter-domain'

const DEFAULT_FORM: JobForm = {
  company: '',
  role: '',
  location: 'Remote - US',
  source: 'Manual',
  stage: 'sourcing',
  nextAction: 'Research the team and apply',
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

export default function JobHunterPage() {
  const [trackedLeads, setTrackedLeads] = useState<TrackedLead[]>(() => loadTrackedLeads())
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
  const [submittedQuery, setSubmittedQuery] = useState(buildSearchQuery(LIFE_MODE_CONFIG[initialLifeMode].defaultQuery, 'remote-first'))
  const [selectedSources, setSelectedSources] = useState<SearchSourceKey[]>(DEFAULT_SOURCE_KEYS)
  const [smartFilter, setSmartFilter] = useState(LIFE_MODE_CONFIG[initialLifeMode].smartFilter)
  const [browserAssistEnabled, setBrowserAssistEnabled] = useState(LIFE_MODE_CONFIG[initialLifeMode].browserAssist)
  const [strictReviewFilter, setStrictReviewFilter] = useState(LIFE_MODE_CONFIG[initialLifeMode].strictReviewFilter)
  const [minimumHourlyRate, setMinimumHourlyRate] = useState(TARGET_PROFILE.payFloor)
  const [showAllJobs, setShowAllJobs] = useState(false)
  const [form, setForm] = useState<JobForm>(DEFAULT_FORM)

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(TRACKED_STORAGE_KEY, JSON.stringify(trackedLeads))
  }, [trackedLeads])

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
      const additions = strongMatches
        .filter(job => !seen.has(job.url))
        .map(job => reviewQueueFromJob(job, 'browser'))

      if (additions.length === 0) return prev

      return [...additions, ...prev].sort((a, b) => b.score - a.score || new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())
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
  const trackedIds = useMemo(() => new Set(trackedLeads.map(lead => lead.sourceId).filter(Boolean)), [trackedLeads])

  const stats = useMemo(() => [
    { label: 'Tracked jobs', value: trackedLeads.length },
    { label: 'Live openings', value: rankedLiveJobs.length },
    { label: 'Interviews', value: trackedLeads.filter(lead => lead.stage === 'interviewing').length },
    { label: 'Offers', value: trackedLeads.filter(lead => lead.stage === 'offer').length },
  ], [rankedLiveJobs.length, trackedLeads])

  const filteredTrackedLeads = useMemo(
    () => trackedLeads.filter(lead => stageFilter === 'all' || lead.stage === stageFilter),
    [stageFilter, trackedLeads],
  )

  const groupedTrackedLeads = useMemo(
    () => STAGES.map(stage => ({
      ...stage,
      leads: filteredTrackedLeads.filter(lead => lead.stage === stage.id),
    })),
    [filteredTrackedLeads],
  )

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
    const location = mode === 'local-fallback'
      ? TARGET_PROFILE.location
      : mode === 'hybrid-ok'
        ? 'remote hybrid'
        : 'remote'
    openExternal(buildGoogleSearchUrlFromText(buildSearchQuery(searchInput, mode), location))
  }

  const trackJob = (job: LiveJob, stage: StageId = 'sourcing') => {
    setTrackedLeads(prev => {
      const existing = prev.find(lead => lead.sourceId === job.sourceId)
      if (existing) {
        return prev.map(lead => (
          lead.sourceId === job.sourceId
            ? { ...lead, stage: lead.stage === 'archived' ? stage : lead.stage }
            : lead
        ))
      }
      return [{ ...leadFromJob(job), stage }, ...prev]
    })
  }

  const setFeedbackForJob = (job: LiveJob, feedback: JobFeedback) => {
    const key = jobKey(job)
    setJobFeedback(prev => ({ ...prev, [key]: feedback }))
    if (feedback === 'applied') {
      trackJob(job, 'applied')
    }
  }

  const addManualLead = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.company.trim() || !form.role.trim()) return

    const nextLead: TrackedLead = {
      id: createId(),
      company: form.company.trim(),
      role: form.role.trim(),
      location: form.location.trim() || 'Remote - US',
      source: form.source.trim() || 'Manual',
      stage: form.stage,
      nextAction: form.nextAction.trim() || 'Follow up',
      due: form.due.trim() || 'Today',
      priority: form.priority,
      tags: normalizeTags(form.tags),
      notes: form.notes.trim(),
    }

    setTrackedLeads(prev => [nextLead, ...prev])
    setForm(DEFAULT_FORM)
  }

  const advanceLead = (id: string) => {
    setTrackedLeads(prev => prev.map(lead => (
      lead.id === id ? { ...lead, stage: nextStage(lead.stage) } : lead
    )))
  }

  const archiveLead = (id: string) => {
    setTrackedLeads(prev => prev.map(lead => (
      lead.id === id ? { ...lead, stage: 'archived' } : lead
    )))
  }

  const removeLead = (id: string) => {
    setTrackedLeads(prev => prev.filter(lead => lead.id !== id))
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
    return [...reviewQueue].sort((a, b) => b.score - a.score || new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())
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
    return trackedLeads
      .filter(lead => lead.stage !== 'archived')
      .slice(0, 5)
      .map(lead => ({
        id: lead.id,
        label: `${lead.company} · ${lead.role}`,
        detail: `${lead.nextAction} (${lead.due})`,
        stage: lead.stage,
      }))
  }, [trackedLeads])

  const browserReviewItems = useMemo(
    () => sortedReviewQueue
      .filter(item => !strictReviewFilter || item.score >= LOW_SIGNAL_SCORE_FLOOR)
      .slice(0, 6),
    [sortedReviewQueue, strictReviewFilter],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', paddingBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <PageHeader defaultTitle="Job Hunter" defaultSubtitle="Live openings, saved targets, and follow-up tracking" />
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
          onClick={() => setTrackedLeads([])}
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
          Clear tracked jobs
        </button>
      </div>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '12px',
      }}>
        {stats.map(stat => (
          <div
            key={stat.label}
            style={{
              background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '16px',
              boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)',
        gap: '16px',
        alignItems: 'stretch',
      }}>
        <div style={{
          background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '16px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Focused search
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {TARGET_PROFILE.title}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {TARGET_PROFILE.focus}
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {TARGET_PROFILE.background}
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <span style={badgeStyle('sourcing')}>
              <MapPin size={11} /> {TARGET_PROFILE.location}
            </span>
            <span style={badgeStyle('applied')}>
              <Sparkle size={11} /> AI + automation
            </span>
            <span style={badgeStyle('interviewing')}>
              <Briefcase size={11} /> Entry-level friendly
            </span>
          </div>
          <div style={{
            marginTop: '14px',
            padding: '12px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-base)',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Search preference
            </div>
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {TARGET_PROFILE.workMode}
            </div>
            <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {WORK_MODES.map(option => (
                <button
                  key={option.id}
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
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {WORK_MODES.find(option => option.id === mode)?.description}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(Object.entries(LIFE_MODE_CONFIG) as Array<[LifeMode, (typeof LIFE_MODE_CONFIG)[LifeMode]]>).map(([value, config]) => {
                const active = lifeMode === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applyLifeMode(value)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: active ? 'var(--accent-a12)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      minWidth: '170px',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{config.label}</div>
                    <div style={{ marginTop: '3px', fontSize: '11px', lineHeight: 1.4, opacity: 0.8 }}>{config.blurb}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {lifeMode === 'unemployed' ? 'Fast lane: top jobs first, fewer distractions, browser review ready.' : 'Browse lane: more jobs, broader comparison, less aggressive filtering.'}
            </div>
            <div style={{
              marginTop: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '8px',
              alignItems: 'end',
            }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Min hourly rate</span>
                <input
                  type="number"
                  min={15}
                  step={1}
                  value={minimumHourlyRate}
                  onChange={e => setMinimumHourlyRate(Number(e.target.value) || TARGET_PROFILE.payFloor)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                padding: '9px 10px',
                color: 'var(--text-secondary)',
                fontSize: '12px',
              }}>
                {mode === 'remote-first' ? 'Remote first' : mode === 'hybrid-ok' ? 'Hybrid okay' : 'Local fallback'}
              </div>
            </div>
            <div style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Search sources
              </div>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {SOURCE_OPTIONS.map(option => {
                  const active = selectedSources.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
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
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                LinkedIn and Indeed stay available as search launchers only. They are not hidden behind this source filter.
              </div>
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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
                  Smart filter {smartFilter ? 'on' : 'off'}
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
                  Browser review {browserAssistEnabled ? 'on' : 'off'}
                </button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Smart filter drops stale listings older than {smartFilter ? '21' : '60'} days and low-signal posts.
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Browser review is optional. Use it to queue jobs for a real logged-in browser session, screenshots, and manual review.
              </div>
              <div style={{
                marginTop: '12px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--bg-base)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Saved searches
                </div>
                <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' }}>
                  <input
                    value={savedSearchName}
                    onChange={e => setSavedSearchName(e.target.value)}
                    placeholder="Name this search"
                    style={{
                      padding: '9px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={saveCurrentSearch}
                    style={{
                      padding: '9px 12px',
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
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {savedSearches.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No saved searches yet.</span>
                  ) : savedSearches.slice(0, 4).map(search => (
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
              </div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '16px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Search keywords
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {TARGET_PROFILE.keywords.map(keyword => (
              <span
                key={keyword}
                style={{
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                }}
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(340px, 1fr)',
        gap: '16px',
        alignItems: 'start',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FunnelSimple size={14} style={{ color: 'var(--accent)' }} />
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Find live jobs
                </div>
              </div>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: '240px', flex: '1 1 260px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <MagnifyingGlass size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search by title, keyword, or company"
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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
              {lifeMode === 'unemployed' ? (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Fast lane is on: top jobs only, apply now.</span>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Browse mode is on: more results, more comparison room.</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              {QUICK_SEARCHES.map(query => (
                <button
                  key={query}
                  onClick={() => handleQuickSearch(query)}
                  style={{
                    padding: '7px 12px',
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {liveJobsQuery.error ? (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '18px',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Could not load live jobs
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {liveJobsQuery.error instanceof Error ? liveJobsQuery.error.message : 'The job search service returned an error.'}
                </div>
              </div>
            ) : visibleLiveJobs.length === 0 && !liveJobsQuery.isFetching ? (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '18px',
              }}>
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
                      borderRadius: '16px',
                      padding: '16px',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                          {job.title}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                          <span>{job.company}</span>
                          <span>·</span>
                          <span>{job.category}</span>
                        </div>
                      </div>
                      <span style={badgeStyle('sourcing')}>{job.source}</span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
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

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '12px' }}>
                      {truncate(job.summary, 260)}
                    </div>

                    <div style={{
                      marginTop: '12px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-base)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                            Best apply route
                          </div>
                          <div style={{ marginTop: '5px', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {recommendation.label}
                          </div>
                        </div>
                        <span style={actionStyle}>
                          {actionLabel}
                        </span>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {recommendation.reason}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                        {uniqueStrings([...analysis.signals, ...analysis.reasons]).slice(0, 4).map(signal => (
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
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openExternal(recommendation.url)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '9px 12px',
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
                          {recommendation.label}
                        </button>
                        <button
                          onClick={() => queueForReview(job, browserAssistEnabled ? 'browser' : 'manual')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '9px 12px',
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
                          onClick={() => openExternal(buildGoogleSearchUrl(job))}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '9px 12px',
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
                        <button
                          onClick={() => openExternal(buildLinkedInSearchUrl(job))}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '9px 12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          LinkedIn
                        </button>
                        <button
                          onClick={() => openExternal(buildIndeedSearchUrl(job))}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '9px 12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                          }}
                        >
                          Indeed
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => openExternal(job.url)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '9px 12px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: 'var(--accent-a10)',
                          color: 'var(--accent)',
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
                          padding: '9px 12px',
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
                        onClick={() => setFeedbackForJob(job, 'good')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '9px 12px',
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
                          padding: '9px 12px',
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
                          padding: '9px 12px',
                          borderRadius: '10px',
                          border: '1px solid var(--border)',
                          background: jobFeedback[jobKey(job)] === 'ignored' ? 'var(--bg-elevated)' : 'transparent',
                          color: jobFeedback[jobKey(job)] === 'ignored' ? 'var(--text-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        Ignore
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

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <Plus size={14} style={{ color: 'var(--accent)' }} />
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                Manual target
              </div>
            </div>

            <form onSubmit={addManualLead} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Company</span>
                <input
                  value={form.company}
                  onChange={e => setForm(prev => ({ ...prev, company: e.target.value }))}
                  required
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Role</span>
                <input
                  value={form.role}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                  required
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Location</span>
                <input
                  value={form.location}
                  onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Source</span>
                <input
                  value={form.source}
                  onChange={e => setForm(prev => ({ ...prev, source: e.target.value }))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Stage</span>
                <select
                  value={form.stage}
                  onChange={e => setForm(prev => ({ ...prev, stage: e.target.value as StageId }))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  {STAGES.map(stage => (
                    <option key={stage.id} value={stage.id}>{stage.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Priority</span>
                <select
                  value={form.priority}
                  onChange={e => setForm(prev => ({ ...prev, priority: e.target.value as JobPriority }))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Next action</span>
                <input
                  value={form.nextAction}
                  onChange={e => setForm(prev => ({ ...prev, nextAction: e.target.value }))}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tags</span>
                <input
                  value={form.tags}
                  onChange={e => setForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="frontend, referral, urgent"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'vertical',
                  }}
                />
              </label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="submit"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'var(--text-on-color)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  Save target
                </button>
              </div>
            </form>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Follow-up reminders
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {reminders.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>
                  Tracked jobs will appear here with a next action and due date.
                </div>
              ) : reminders.map(reminder => (
                <div
                  key={reminder.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {reminder.label}
                    </div>
                    <span style={badgeStyle(reminder.stage)}>
                      {reminder.stage}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {reminder.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <div style={{
            background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Pipeline
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button
                onClick={() => setStageFilter('all')}
                style={{
                  padding: '7px 12px',
                  borderRadius: '999px',
                  border: '1px solid var(--border)',
                  background: stageFilter === 'all' ? 'var(--accent-a12)' : 'transparent',
                  color: stageFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {STAGES.map(stage => (
                <button
                  key={stage.id}
                  onClick={() => setStageFilter(stage.id)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: stageFilter === stage.id ? 'var(--accent-a12)' : 'transparent',
                    color: stageFilter === stage.id ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {stage.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {groupedTrackedLeads.map(stage => (
                <div
                  key={stage.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '12px',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {stage.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                        {stage.blurb}
                      </div>
                    </div>
                    <span style={badgeStyle(stage.id)}>
                      {stage.leads.length}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {stage.leads.length === 0 ? (
                      <div style={{
                        padding: '12px',
                        borderRadius: '12px',
                        border: '1px dashed var(--border)',
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        lineHeight: 1.5,
                        textAlign: 'center',
                      }}>
                        No tracked jobs here yet.
                      </div>
                    ) : stage.leads.map(lead => (
                      <article
                        key={lead.id}
                        style={{
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-card) 100%)',
                          padding: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                              {lead.role}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                              {lead.company} · {lead.location}
                            </div>
                          </div>
                          <span style={badgeStyle(lead.stage, lead.priority)}>
                            {lead.priority}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                          <span style={badgeStyle(lead.stage)}>{lead.source}</span>
                          <span style={badgeStyle(lead.stage)}>{lead.due}</span>
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '10px' }}>
                          {lead.nextAction}
                        </div>

                        {lead.notes && (
                          <div style={{
                            marginTop: '10px',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            lineHeight: 1.45,
                          }}>
                            {lead.notes}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                          {lead.tags.map(tag => (
                            <span
                              key={tag}
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                background: 'var(--bg-base)',
                                border: '1px solid var(--border)',
                                borderRadius: '999px',
                                padding: '3px 8px',
                              }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button
                            onClick={() => advanceLead(lead.id)}
                            disabled={lead.stage === 'archived'}
                            style={{
                              flex: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '9px 10px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                              background: lead.stage === 'archived' ? 'var(--bg-base)' : 'var(--accent-a10)',
                              color: lead.stage === 'archived' ? 'var(--text-muted)' : 'var(--accent)',
                              cursor: lead.stage === 'archived' ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            Advance
                            <ArrowRight size={13} />
                          </button>
                          <button
                            onClick={() => archiveLead(lead.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '9px 10px',
                              borderRadius: '10px',
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            <Archive size={13} />
                            Archive
                          </button>
                          <button
                            onClick={() => removeLead(lead.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '9px 10px',
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
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
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
              ) : browserReviewItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    padding: '10px 12px',
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
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
                    <span style={badgeStyle('applied')}>
                      {item.mode}
                    </span>
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
              ))}
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-elevated) 100%)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Daily loop
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Search live openings and save the promising ones immediately.',
                'Send one high-signal application or referral ask.',
                'Prep the next interview with role-specific notes.',
                'Archive dead leads so the board stays honest.',
              ].map((step, index) => (
                <div
                  key={step}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-base)',
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--accent-a12)',
                    color: 'var(--accent)',
                    fontWeight: 800,
                    fontSize: '11px',
                    flexShrink: 0,
                  }}>
                    {index + 1}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Search stack
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Remotive', 'Remote OK', 'Arbeitnow', 'company careers', 'ATS pages', 'Google search', 'LinkedIn', 'Indeed'].map(source => (
                <span
                  key={source}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                  }}
                >
                  {source}
                </span>
              ))}
            </div>
          </div>

          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '12px' }}>
              What to watch
            </div>
            <EmptyState
              icon={MagnifyingGlass}
              title={trackedLeads.length === 0 ? 'Nothing tracked yet' : 'Keep the pipeline warm'}
              description={trackedLeads.length === 0
                ? 'Search live openings above, save the promising ones, and turn them into a real pipeline.'
                : 'Track outreach quality, keep interviews moving, and archive dead ends fast.'}
            />
          </div>
        </aside>
      </section>
    </div>
  )
}
