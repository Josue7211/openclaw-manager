import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  CheckCircle,
  Clock,
  Database,
  FileVideo,
  Lightning,
  PencilSimple,
  Plus,
  Sparkle,
  TrendUp,
  VideoCamera,
} from '@phosphor-icons/react'
import type {
  ContentIdea,
  GrowthAnalyticsImportRow,
  GrowthCalendarSlot,
  GrowthConnectorStatus,
  GrowthOpsState,
  GrowthPlatform,
  PostPackage,
  ViralVideo,
} from '@/pages/growth-ops-types'
import { growthOpsApi, type GrowthAgentRun } from '@/pages/growth-ops-api'
import {
  addManualViralVideo,
  approvePostPackage,
  badgeStyle,
  buildTodaysShootList,
  buildWeeklyContentCalendar,
  commitAnalyticsImport,
  createPostPackageFromIdea,
  generateDailyContentIdeas,
  GROWTH_PLATFORMS,
  growthMetricScore,
  markGrowthOpsPendingUpload,
  moveIdeaInQueue,
  parseGrowthCsvRows,
  PLATFORM_LABEL,
  previewAnalyticsImport,
  truncate,
  updateCalendarSlots,
  updateRecipeLearning,
  validatePostPackage,
} from '@/features/growth-ops/domain'

const PLATFORMS = GROWTH_PLATFORMS
const platformLabel = PLATFORM_LABEL

const inputStyle = {
  width: '100%',
  padding: '8px 9px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontSize: '12px',
} satisfies CSSProperties

const textareaStyle = {
  ...inputStyle,
  minHeight: '72px',
  resize: 'vertical',
  lineHeight: 1.35,
} satisfies CSSProperties

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--accent-a10)',
  color: 'var(--accent)',
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
} satisfies CSSProperties

const quietButtonStyle = {
  ...buttonStyle,
  background: 'var(--bg-card)',
  color: 'var(--text-secondary)',
} satisfies CSSProperties

const panelStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '12px',
  minWidth: 0,
} satisfies CSSProperties

const tableRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.7fr 0.7fr',
  gap: '8px',
  alignItems: 'center',
  padding: '8px 0',
  borderTop: '1px solid var(--border)',
} satisfies CSSProperties

function emptyVideoForm() {
  return {
    platform: 'tiktok' as GrowthPlatform,
    creatorHandle: '',
    url: '',
    hook: '',
    topic: 'science-based lifting',
    format: 'hook + gym demo + CTA',
    lengthSeconds: 35,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    notes: '',
  }
}

function queueApprovedPackage(postPackage: PostPackage): PostPackage {
  const approved = approvePostPackage(postPackage)
  return approved.approvalState === 'queued' ? { ...approved, validationErrors: [] } : approved
}

export function GrowthOpsWorkspace({
  state,
  onCommit,
  syncMode,
}: {
  state: GrowthOpsState
  onCommit: (state: GrowthOpsState) => Promise<void> | void
  syncMode: 'loading' | 'synced' | 'migrated' | 'offline'
}) {
  const [videoForm, setVideoForm] = useState(emptyVideoForm)
  const [bulkVideoText, setBulkVideoText] = useState('platform,creator,url,hook,topic,format,length,views,likes,comments,shares,saves,notes\n')
  const [analyticsText, setAnalyticsText] = useState('platform,package,idea,recipe,topic,horizon,views,likes,comments,shares,saves,watch_retention,follower_delta,lead_signal,confidence\n')
  const [analyticsPreview, setAnalyticsPreview] = useState<GrowthAnalyticsImportRow[]>([])
  const [connectors, setConnectors] = useState<GrowthConnectorStatus[]>([])
  const [runs, setRuns] = useState<GrowthAgentRun[]>([])
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [busyLabel, setBusyLabel] = useState('')

  const learnedState = useMemo(() => updateRecipeLearning(state), [state])
  const selectedPackage = useMemo(
    () => state.postPackages.find(postPackage => postPackage.id === selectedPackageId) ?? state.postPackages[0] ?? null,
    [selectedPackageId, state.postPackages],
  )
  const queuedPackages = useMemo(
    () =>
      state.postPackages.filter(postPackage =>
        ['ready-for-approval', 'queued', 'blocked', 'needs-video', 'draft'].includes(postPackage.approvalState),
      ),
    [state.postPackages],
  )
  const calendarSlots = useMemo(() => buildWeeklyContentCalendar(state), [state])
  const todaysShootList = useMemo(() => buildTodaysShootList(state), [state])

  useEffect(() => {
    let cancelled = false
    const loadMeta = async () => {
      const [connectorState, runState] = await Promise.all([
        growthOpsApi.getConnectorStatus().catch(() => []),
        growthOpsApi.getRuns().catch(() => []),
      ])
      if (!cancelled) {
        setConnectors(connectorState)
        setRuns(runState)
      }
    }
    void loadMeta()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshRuns = async () => {
    const next = await growthOpsApi.getRuns().catch(() => [])
    setRuns(next)
  }

  const persist = async (next: GrowthOpsState, apiCall?: () => Promise<GrowthOpsState | null>) => {
    try {
      const uploaded = apiCall ? await apiCall() : null
      await onCommit(uploaded ?? next)
    } catch {
      markGrowthOpsPendingUpload(next)
      await onCommit(next)
    }
  }

  const submitVideo = async (event: FormEvent) => {
    event.preventDefault()
    if (!videoForm.url.trim() || !videoForm.hook.trim()) return
    const video: Omit<ViralVideo, 'id' | 'capturedAt' | 'source' | 'sourceConfidence'> = {
      platform: videoForm.platform,
      creatorHandle: videoForm.creatorHandle.trim() || 'watchlist',
      url: videoForm.url.trim(),
      hook: videoForm.hook.trim(),
      topic: videoForm.topic.trim() || 'science-based lifting',
      format: videoForm.format.trim() || 'hook + gym demo + CTA',
      lengthSeconds: videoForm.lengthSeconds,
      metrics: {
        views: videoForm.views,
        likes: videoForm.likes,
        comments: videoForm.comments,
        shares: videoForm.shares,
        saves: videoForm.saves,
        leadSignal: 0,
      },
      notes: videoForm.notes.trim(),
    }
    const localNext = addManualViralVideo(state, video)
    await persist(localNext, () => growthOpsApi.addViralVideo(video))
    setVideoForm(emptyVideoForm())
  }

  const submitBulkVideos = async () => {
    const rows = parseGrowthCsvRows(bulkVideoText)
    const videos = rows
      .map((row, index): ViralVideo => ({
        id: `viral-bulk-${Date.now()}-${index}`,
        platform: (row.platform === 'instagram' || row.platform === 'youtube' || row.platform === 'tiktok' ? row.platform : 'tiktok') as GrowthPlatform,
        creatorHandle: row.creator || row.creator_handle || row.handle || 'watchlist',
        url: row.url || row.video_url || '',
        hook: row.hook || '',
        topic: row.topic || 'science-based lifting',
        format: row.format || 'hook + gym demo + CTA',
        lengthSeconds: Number(row.length || row.length_seconds || 0) || 0,
        metrics: {
          views: Number(row.views || 0) || 0,
          likes: Number(row.likes || 0) || 0,
          comments: Number(row.comments || 0) || 0,
          shares: Number(row.shares || 0) || 0,
          saves: Number(row.saves || 0) || 0,
          leadSignal: 0,
        },
        notes: row.notes || '',
        source: 'manual-link',
        sourceConfidence: row.confidence === 'high' || row.confidence === 'low' ? row.confidence : 'medium',
        capturedAt: new Date().toISOString(),
      }))
      .filter(video => video.url.trim() && video.hook.trim())
    if (videos.length === 0) return
    await persist(updateRecipeLearning({ ...state, viralVideos: [...videos, ...state.viralVideos] }))
  }

  const previewAnalytics = async () => {
    const localPreview = previewAnalyticsImport(state, analyticsText)
    setAnalyticsPreview(localPreview)
    const serverPreview = await growthOpsApi.previewAnalyticsImport(parseGrowthCsvRows(analyticsText)).catch(() => [])
    if (serverPreview.length > 0) setAnalyticsPreview(serverPreview)
  }

  const commitAnalytics = async () => {
    if (analyticsPreview.length === 0) return
    const localNext = commitAnalyticsImport(state, analyticsPreview)
    try {
      const result = await growthOpsApi.commitAnalyticsImport(analyticsPreview)
      if (result.run) setRuns(prev => [result.run!, ...prev.filter(item => item.id !== result.run!.id)].slice(0, 25))
      await onCommit(result.state ? updateRecipeLearning(result.state) : localNext)
    } catch {
      await persist(localNext)
    }
    setAnalyticsPreview([])
  }

  const generateIdeas = async () => {
    setBusyLabel('Generating ideas')
    const learned = updateRecipeLearning(state)
    const localNext = { ...learned, contentIdeas: generateDailyContentIdeas(learned) }
    await persist(localNext, () => growthOpsApi.generateIdeas())
    setBusyLabel('')
  }

  const createPackage = async (idea: ContentIdea) => {
    const postPackage = createPostPackageFromIdea(idea)
    const localNext = {
      ...state,
      contentIdeas: state.contentIdeas.map(item => (item.id === idea.id ? { ...item, status: 'packaged' as const } : item)),
      postPackages: [postPackage, ...state.postPackages.filter(item => item.ideaId !== idea.id)],
    }
    setSelectedPackageId(postPackage.id)
    await persist(localNext, () => growthOpsApi.upsertPostPackage(postPackage))
  }

  const patchPackage = async (postPackage: PostPackage, patch: Partial<PostPackage>) => {
    const patched = validatePostPackage({ ...postPackage, ...patch })
    const localNext = {
      ...state,
      postPackages: state.postPackages.map(item => (item.id === postPackage.id ? patched : item)),
    }
    await persist(localNext, () => growthOpsApi.patchPostPackage({ id: postPackage.id, ...patch }))
  }

  const patchIdea = async (idea: ContentIdea, patch: Partial<ContentIdea>) => {
    const localNext = {
      ...state,
      contentIdeas: state.contentIdeas.map(item => (item.id === idea.id ? { ...item, ...patch } : item)),
    }
    await persist(localNext)
  }

  const moveIdea = async (idea: ContentIdea, direction: -1 | 1) => {
    await persist(moveIdeaInQueue(state, idea.id, direction))
  }

  const approvePackage = async (postPackage: PostPackage) => {
    const localPackage = queueApprovedPackage(postPackage)
    const localNext = {
      ...state,
      postPackages: state.postPackages.map(item => (item.id === postPackage.id ? localPackage : item)),
    }
    try {
      const approved = await growthOpsApi.approvePostPackage(postPackage.id)
      await onCommit({
        ...state,
        postPackages: state.postPackages.map(item => (item.id === postPackage.id ? approved ?? localPackage : item)),
      })
    } catch {
      await onCommit(localNext)
    }
  }

  const runWatchlist = async () => {
    setBusyLabel('Refreshing watchlist')
    const run = await growthOpsApi.runWatchlistRefresh().catch(() => null)
    if (run) setRuns(prev => [run, ...prev.filter(item => item.id !== run.id)].slice(0, 25))
    await refreshRuns()
    setBusyLabel('')
  }

  const runAnalytics = async () => {
    setBusyLabel('Importing analytics')
    const result = await growthOpsApi.runOwnedAnalytics().catch(() => ({ run: null, state: null }))
    if (result.run) setRuns(prev => [result.run!, ...prev.filter(item => item.id !== result.run!.id)].slice(0, 25))
    if (result.state) await onCommit(updateRecipeLearning(result.state))
    await refreshRuns()
    setBusyLabel('')
  }

  const runRecipeScoring = async () => {
    setBusyLabel('Scoring recipes')
    const result = await growthOpsApi.runRecipeScoring().catch(() => ({ run: null, state: null }))
    if (result.run) setRuns(prev => [result.run!, ...prev.filter(item => item.id !== result.run!.id)].slice(0, 25))
    if (result.state) await onCommit(updateRecipeLearning(result.state))
    await refreshRuns()
    setBusyLabel('')
  }

  const runRecommendations = async () => {
    setBusyLabel('Refreshing recommendations')
    const result = await growthOpsApi.runRecommendationRefresh().catch(() => ({ run: null, state: null }))
    if (result.run) setRuns(prev => [result.run!, ...prev.filter(item => item.id !== result.run!.id)].slice(0, 25))
    if (result.state) await onCommit(updateRecipeLearning(result.state))
    await refreshRuns()
    setBusyLabel('')
  }

  const runPlanning = async () => {
    setBusyLabel('Planning calendar')
    const result = await growthOpsApi.runCalendarPlanning().catch(() => ({ run: null, state: null }))
    if (result.run) setRuns(prev => [result.run!, ...prev.filter(item => item.id !== result.run!.id)].slice(0, 25))
    if (result.state) await onCommit(updateRecipeLearning(result.state))
    await refreshRuns()
    setBusyLabel('')
  }

  const saveCalendarSlot = async (slot: GrowthCalendarSlot) => {
    await persist(updateCalendarSlots(state, [slot]))
  }

  return (
    <section aria-label="Growth Ops" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Overview state={state} syncMode={syncMode} busyLabel={busyLabel} onGenerateIdeas={generateIdeas} />
      <CalendarPanel slots={calendarSlots} shootList={todaysShootList} ideas={state.contentIdeas} packages={state.postPackages} onSaveSlot={saveCalendarSlot} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 0.65fr)', gap: '12px' }}>
        <main style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <RecipeBoard state={learnedState} />
          <IdeaQueue state={state} onPackage={createPackage} onPatch={patchIdea} onMove={moveIdea} />
          <PackageEditor postPackage={selectedPackage} onPatch={patchPackage} onApprove={approvePackage} />
        </main>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <ConnectorPanel connectors={connectors} />
          <ViralCapturePanel videoForm={videoForm} setVideoForm={setVideoForm} bulkVideoText={bulkVideoText} setBulkVideoText={setBulkVideoText} onSubmit={submitVideo} onBulkSubmit={submitBulkVideos} />
          <ApprovalQueue packages={queuedPackages} onSelect={setSelectedPackageId} selectedId={selectedPackage?.id ?? null} />
          <AnalyticsPanel
            state={learnedState}
            analyticsText={analyticsText}
            setAnalyticsText={setAnalyticsText}
            analyticsPreview={analyticsPreview}
            onPreviewAnalytics={previewAnalytics}
            onCommitAnalytics={commitAnalytics}
            onRunPlanning={runPlanning}
            onRunWatchlist={runWatchlist}
            onRunAnalytics={runAnalytics}
            onRunRecipeScoring={runRecipeScoring}
            onRunRecommendations={runRecommendations}
          />
          <RunHistoryPanel runs={runs} />
          <WatchlistPanel state={state} />
        </aside>
      </div>
    </section>
  )
}

function Overview({
  state,
  syncMode,
  busyLabel,
  onGenerateIdeas,
}: {
  state: GrowthOpsState
  syncMode: string
  busyLabel: string
  onGenerateIdeas: () => void
}) {
  const latestSnapshot = state.metricSnapshots[0]
  const pendingUpload = syncMode === 'offline' || (typeof window !== 'undefined' && localStorage.getItem('growth-ops-v2_5-pending-upload') === '1')
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: '8px', flex: '1 1 640px' }}>
          {[
            ['Watchlist', state.creatorWatchlist.length],
            ['Virals', state.viralVideos.length],
            ['Recipes', state.contentRecipes.length],
            ['Ideas', state.contentIdeas.length],
            ['Queue', state.postPackages.filter(item => item.approvalState === 'queued').length],
            ['Snapshots', state.metricSnapshots.length],
            ['Quarantine', state.quarantinedAnalyticsRows.length],
          ].map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '9px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800 }}>{label}</div>
              <div style={{ marginTop: '4px', fontSize: '20px', color: 'var(--text-primary)', fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={badgeStyle(syncMode === 'offline' ? 'archived' : 'sourcing')}>{syncMode}</span>
          {pendingUpload ? <span style={badgeStyle('archived')}>pending local upload</span> : null}
          {latestSnapshot ? <span style={badgeStyle('offer')}>latest score {growthMetricScore(latestSnapshot.metrics)}</span> : null}
          {busyLabel ? <span style={badgeStyle('interviewing')}>{busyLabel}</span> : null}
          <button type="button" onClick={onGenerateIdeas} style={buttonStyle}>
            <Sparkle size={14} />
            Generate ideas
          </button>
        </div>
      </div>
      <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45 }}>
        Sync diagnostics: server wins when server rows exist; one-time local V1 migration stays local until API accepts it; secrets and token values are never shown.
      </div>
    </div>
  )
}

function CalendarPanel({
  slots,
  shootList,
  ideas,
  packages,
  onSaveSlot,
}: {
  slots: ReturnType<typeof buildWeeklyContentCalendar>
  shootList: ReturnType<typeof buildTodaysShootList>
  ideas: ContentIdea[]
  packages: PostPackage[]
  onSaveSlot: (slot: GrowthCalendarSlot) => void
}) {
  const days = Array.from(new Set(slots.map(slot => slot.date)))
  const [draftSlots, setDraftSlots] = useState<Record<string, GrowthCalendarSlot>>({})
  const draftFor = (slot: GrowthCalendarSlot) => draftSlots[slot.id] ?? slot
  const patchSlot = (slot: GrowthCalendarSlot, patch: Partial<GrowthCalendarSlot>) => {
    setDraftSlots(prev => ({ ...prev, [slot.id]: { ...draftFor(slot), ...patch } }))
  }
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<Clock size={15} />} label="Weekly content calendar" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: '8px', overflowX: 'auto', marginTop: '10px' }}>
        {days.map(day => {
          const daySlots = slots.filter(slot => slot.date === day)
          const isBatch = daySlots.some(slot => slot.batchRecording)
          return (
            <div key={day} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px', minWidth: '140px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'center' }}>
                <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--text-primary)' }}>{day.slice(5)}</div>
                {isBatch ? <span style={badgeStyle('interviewing')}>batch</span> : null}
              </div>
              <div style={{ display: 'grid', gap: '6px', marginTop: '7px' }}>
                {daySlots.map(slot => {
                  const draft = draftFor(slot)
                  return (
                  <div key={slot.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900 }}>{platformLabel[slot.platform]}</span>
                      <span style={badgeStyle(slot.state === 'queued' ? 'offer' : slot.state === 'needs-video' ? 'archived' : slot.state === 'idea' ? 'sourcing' : 'applied')}>
                        {slot.state}
                      </span>
                    </div>
                    <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.35 }}>
                      {truncate(slot.title, 58)}
                    </div>
                    <div style={{ display: 'grid', gap: '5px', marginTop: '6px' }}>
                      <select value={draft.platform} onChange={event => patchSlot(slot, { platform: event.target.value as GrowthPlatform })} style={inputStyle} aria-label={`${slot.id} platform`}>
                        {PLATFORMS.map(platform => <option key={platform} value={platform}>{platformLabel[platform]}</option>)}
                      </select>
                      <select value={draft.ideaId ?? ''} onChange={event => patchSlot(slot, { ideaId: event.target.value || undefined, title: ideas.find(idea => idea.id === event.target.value)?.title ?? draft.title })} style={inputStyle} aria-label={`${slot.id} idea`}>
                        <option value="">Open slot</option>
                        {ideas.slice(0, 20).map(idea => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
                      </select>
                      <select value={draft.postPackageId ?? ''} onChange={event => patchSlot(slot, { postPackageId: event.target.value || undefined })} style={inputStyle} aria-label={`${slot.id} package`}>
                        <option value="">No package</option>
                        {packages.map(postPackage => <option key={postPackage.id} value={postPackage.id}>{postPackage.id}</option>)}
                      </select>
                      <select value={draft.state} onChange={event => patchSlot(slot, { state: event.target.value as GrowthCalendarSlot['state'] })} style={inputStyle} aria-label={`${slot.id} status`}>
                        {(['idea', 'scripted', 'needs-video', 'ready-for-approval', 'queued'] as const).map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        <input type="number" value={draft.order} onChange={event => patchSlot(slot, { order: Number(event.target.value) || 0 })} style={inputStyle} aria-label={`${slot.id} order`} />
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          <input type="checkbox" checked={draft.batchRecording} onChange={event => patchSlot(slot, { batchRecording: event.target.checked })} />
                          batch
                        </label>
                      </div>
                      <button type="button" onClick={() => onSaveSlot(draft)} style={quietButtonStyle}>Save slot</button>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
        <SectionTitle icon={<VideoCamera size={15} />} label="Today's shoot list" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', marginTop: '8px' }}>
          {shootList.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No scripted or queued shoots for today.</div>
          ) : (
            shootList.map(item => (
              <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 900 }}>{platformLabel[item.platform]}</span>
                  <span style={badgeStyle(item.state === 'queued' ? 'offer' : item.state === 'needs-video' ? 'archived' : 'applied')}>{item.state}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.35, marginTop: '6px' }}>{truncate(item.title, 90)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ConnectorPanel({ connectors }: { connectors: GrowthConnectorStatus[] }) {
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<Database size={15} />} label="Connector readiness" />
      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
        {PLATFORMS.map(platform => {
          const connector = connectors.find(item => item.platform === platform)
          const status = connector?.status ?? 'not_configured'
          return (
            <div key={platform} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>{platformLabel[platform]}</div>
                <span style={badgeStyle(status === 'ready' || status === 'configured' ? 'offer' : status === 'not_configured' ? 'archived' : 'sourcing')}>
                  {status.replaceAll('_', ' ')}
                </span>
              </div>
              <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.45 }}>
                {connector?.reason ?? `Missing secret service social.${platform}.`}
              </div>
              <div style={{ marginTop: '5px', color: 'var(--text-muted)', fontSize: '11px' }}>
                Service {connector?.service ?? `social.${platform}`} · tokens never stored here
              </div>
              <div style={{ marginTop: '6px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {(connector?.requiredScopes ?? []).map(scope => (
                  <span key={scope} style={badgeStyle(connector?.permissions.includes(scope) ? 'offer' : 'sourcing')}>
                    {scope}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '5px', color: 'var(--text-muted)', fontSize: '11px' }}>
                Last checked {connector?.lastCheckedAt ? connector.lastCheckedAt.slice(0, 19) : 'not yet'}{connector?.blockingReason ? ` · ${connector.blockingReason}` : ''}
              </div>
              <div style={{ marginTop: '5px', color: 'var(--text-muted)', fontSize: '11px' }}>
                Last read-only check {connector?.lastSuccessfulReadOnlyCheckAt ? connector.lastSuccessfulReadOnlyCheckAt.slice(0, 19) : 'never'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecipeBoard({ state }: { state: GrowthOpsState }) {
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<TrendUp size={15} />} label="Recipe scoring" />
      <div style={{ display: 'grid', gap: '0', marginTop: '10px' }}>
        <div style={{ ...tableRowStyle, borderTop: 0, color: 'var(--text-muted)', fontSize: '11px', fontWeight: 800 }}>
          <span>Recipe</span>
          <span>Platform score</span>
          <span>Status</span>
        </div>
        {state.contentRecipes.map(recipe => (
          <div key={recipe.id} style={tableRowStyle}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>{recipe.name}</div>
              <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.35 }}>
                {truncate(recipe.hookFormula, 128)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              <span style={badgeStyle('applied')}>Score {recipe.baselineScore}</span>
              {PLATFORMS.map(platform => (
                <span key={platform} style={badgeStyle('sourcing')}>
                  {platformLabel[platform]} {recipe.platformScores?.[platform] ?? 0}
                </span>
              ))}
            </div>
            <div style={{ display: 'grid', gap: '5px' }}>
              <span style={badgeStyle(recipe.status === 'winning' ? 'offer' : recipe.status === 'failed' ? 'archived' : 'sourcing')}>
                {recipe.status}
              </span>
              <span style={badgeStyle(recipe.recommendation === 'double-down' ? 'offer' : recipe.recommendation === 'pause' ? 'archived' : recipe.recommendation === 'remix' ? 'interviewing' : 'sourcing')}>
                {recipe.recommendation}
              </span>
              {recipe.topicFatigue ? <span style={badgeStyle('archived')}>fatigue risk</span> : null}
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.3 }}>{recipe.recommendationReason}</span>
              {recipe.recommendationEvidence.slice(0, 2).map(evidence => (
                <span key={evidence.id} style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.3 }}>
                  Evidence: {truncate(evidence.summary, 92)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IdeaQueue({
  state,
  onPackage,
  onPatch,
  onMove,
}: {
  state: GrowthOpsState
  onPackage: (idea: ContentIdea) => void
  onPatch: (idea: ContentIdea, patch: Partial<ContentIdea>) => void
  onMove: (idea: ContentIdea, direction: -1 | 1) => void
}) {
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<Lightning size={15} />} label="Idea generation" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '8px', marginTop: '10px' }}>
        {state.contentIdeas.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No ideas generated yet.</div>
        ) : (
          state.contentIdeas.slice(0, 10).map(idea => (
            <div key={idea.id} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>{idea.title}</div>
                {idea.makeToday ? <span style={badgeStyle('offer')}>make today</span> : null}
              </div>
              <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
                {truncate(idea.scriptOutline.join(' '), 150)}
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '7px' }}>
                <span style={badgeStyle(idea.status === 'queued' ? 'offer' : idea.status === 'needs-video' ? 'archived' : idea.status === 'scripted' ? 'applied' : 'sourcing')}>
                  {idea.status}
                </span>
                {PLATFORMS.map(platform => (
                  <span key={platform} style={badgeStyle('applied')}>
                    {platformLabel[platform]}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                <button type="button" onClick={() => onMove(idea, -1)} style={quietButtonStyle} aria-label={`Move ${idea.title} up`}>
                  Up
                </button>
                <button type="button" onClick={() => onMove(idea, 1)} style={quietButtonStyle} aria-label={`Move ${idea.title} down`}>
                  Down
                </button>
                <button type="button" onClick={() => onPatch(idea, { status: 'scripted' })} style={quietButtonStyle}>
                  Scripted
                </button>
                <button type="button" onClick={() => onPackage(idea)} style={buttonStyle}>
                  <VideoCamera size={14} />
                  Package
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PackageEditor({
  postPackage,
  onPatch,
  onApprove,
}: {
  postPackage: PostPackage | null
  onPatch: (postPackage: PostPackage, patch: Partial<PostPackage>) => Promise<void> | void
  onApprove: (postPackage: PostPackage) => Promise<void> | void
}) {
  const [draft, setDraft] = useState<PostPackage | null>(postPackage)

  useEffect(() => {
    setDraft(postPackage)
  }, [postPackage])

  if (!postPackage) {
    return (
      <div style={panelStyle}>
        <SectionTitle icon={<PencilSimple size={15} />} label="Package editing" />
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '10px' }}>Create a package from an idea to edit platform variants.</div>
      </div>
    )
  }

  const draftPackage = validatePostPackage(draft ?? postPackage)

  const updateVariant = (platform: GrowthPlatform, patch: Partial<PostPackage['platformVariants'][GrowthPlatform]>) => {
    setDraft(prev => {
      const source = prev ?? postPackage
      return {
        ...source,
        platformVariants: {
          ...source.platformVariants,
          [platform]: { ...source.platformVariants[platform], ...patch },
        },
      }
    })
  }

  const updateChecklist = (field: 'shotList' | 'brollChecklist', id: string, patch: { done?: boolean; label?: string }) => {
    setDraft(prev => {
      const source = prev ?? postPackage
      return { ...source, [field]: source[field].map(item => (item.id === id ? { ...item, ...patch } : item)) }
    })
  }

  const addChecklistItem = (field: 'shotList' | 'brollChecklist') => {
    setDraft(prev => {
      const source = prev ?? postPackage
      return { ...source, [field]: [...source[field], { id: `${field}-${Date.now()}`, label: field === 'shotList' ? 'New shot' : 'New b-roll', done: false }] }
    })
  }

  const removeChecklistItem = (field: 'shotList' | 'brollChecklist', id: string) => {
    setDraft(prev => {
      const source = prev ?? postPackage
      return { ...source, [field]: source[field].filter(item => item.id !== id) }
    })
  }

  const updateLines = (field: 'coverTitleVariants', value: string) => {
    setDraft(prev => ({ ...(prev ?? postPackage), [field]: value.split('\n').map(item => item.trim()).filter(Boolean) }))
  }

  const saveDraft = async () => {
    await onPatch(postPackage, draftPackage)
  }

  const approveDraft = async () => {
    await onPatch(postPackage, draftPackage)
    await onApprove(draftPackage)
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <SectionTitle icon={<PencilSimple size={15} />} label="Package editing" />
        <span style={badgeStyle(postPackage.approvalState === 'queued' ? 'offer' : postPackage.approvalState === 'blocked' ? 'archived' : 'sourcing')}>
          {postPackage.approvalState}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px', marginTop: '10px' }}>
        <label style={{ display: 'grid', gap: '5px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 800 }}>
          Script draft
          <textarea
            value={draftPackage.scriptDraft}
            onChange={event => setDraft(prev => ({ ...(prev ?? postPackage), scriptDraft: event.target.value }))}
            placeholder="Hook, demo, proof, CTA"
            style={{ ...textareaStyle, minHeight: '130px' }}
            aria-label="Script draft"
          />
        </label>
        <label style={{ display: 'grid', gap: '5px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 800 }}>
          Cover/title variants
          <textarea
            value={draftPackage.coverTitleVariants.join('\n')}
            onChange={event => updateLines('coverTitleVariants', event.target.value)}
            placeholder="One cover/title per line"
            style={{ ...textareaStyle, minHeight: '130px' }}
            aria-label="Cover title variants"
          />
        </label>
        <label style={{ display: 'grid', gap: '5px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 800 }}>
          Video file
          <input
            value={draftPackage.videoFile ?? ''}
            onChange={event => setDraft(prev => ({ ...(prev ?? postPackage), videoFile: event.target.value }))}
            placeholder="Video file path"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '5px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 800 }}>
          Cover file
          <input
            value={draftPackage.coverFile ?? ''}
            onChange={event => setDraft(prev => ({ ...(prev ?? postPackage), coverFile: event.target.value }))}
            placeholder="Cover image path"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px', marginTop: '10px' }}>
        {([
          ['shotList', 'Shot list'],
          ['brollChecklist', 'B-roll checklist'],
        ] as const).map(([field, label]) => (
          <div key={field} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '9px' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>{label}</div>
            <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
              {draftPackage[field].map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={item.done} onChange={event => updateChecklist(field, item.id, { done: event.target.checked })} aria-label={`${label} ${item.label} done`} />
                  <input value={item.label} onChange={event => updateChecklist(field, item.id, { label: event.target.value })} style={inputStyle} aria-label={`${label} item`} />
                  <button type="button" onClick={() => removeChecklistItem(field, item.id)} style={quietButtonStyle} aria-label={`Remove ${item.label}`}>Remove</button>
                </div>
              ))}
              <button type="button" onClick={() => addChecklistItem(field)} style={quietButtonStyle}>Add {label}</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '9px', marginTop: '10px' }}>
        {PLATFORMS.map(platform => {
          const variant = draftPackage.platformVariants[platform]
          return (
            <div key={platform} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 900 }}>
                  <input
                    type="checkbox"
                    checked={variant.enabled}
                    onChange={event => updateVariant(platform, { enabled: event.target.checked })}
                  />
                  {platformLabel[platform]}
                </label>
                <span style={badgeStyle(variant.enabled ? 'applied' : 'archived')}>{variant.enabled ? 'enabled' : 'off'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 170px', gap: '8px', marginTop: '8px' }}>
                <input value={variant.title} onChange={event => updateVariant(platform, { title: event.target.value })} style={inputStyle} aria-label={`${platformLabel[platform]} title`} />
                <input value={variant.scheduledAt} onChange={event => updateVariant(platform, { scheduledAt: event.target.value })} style={inputStyle} aria-label={`${platformLabel[platform]} schedule`} />
              </div>
              <textarea value={variant.caption} onChange={event => updateVariant(platform, { caption: event.target.value })} style={{ ...textareaStyle, marginTop: '8px' }} aria-label={`${platformLabel[platform]} caption`} />
            </div>
          )
        })}
      </div>

      {draftPackage.validationErrors.length > 0 ? (
        <div style={{ marginTop: '9px', color: 'var(--red)', fontSize: '12px', lineHeight: 1.45 }}>
          Validation preview: {draftPackage.validationErrors.join(' ')}
        </div>
      ) : (
        <div style={{ marginTop: '9px', color: 'var(--green)', fontSize: '12px', lineHeight: 1.45 }}>Validation preview: ready for internal approval queue.</div>
      )}

      {draftPackage.approvalAudit.length > 0 ? (
        <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>Approval audit trail</div>
          <div style={{ display: 'grid', gap: '5px', marginTop: '6px' }}>
            {draftPackage.approvalAudit.slice(-4).map(event => (
              <div key={event.id} style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                {event.at.slice(0, 19)} · {event.event} · {event.notes}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
        <button type="button" onClick={saveDraft} style={quietButtonStyle}>
          Save edits
        </button>
        <button type="button" onClick={approveDraft} style={buttonStyle}>
          <CheckCircle size={14} />
          Approve to queue
        </button>
      </div>
    </div>
  )
}

function ViralCapturePanel({
  videoForm,
  setVideoForm,
  bulkVideoText,
  setBulkVideoText,
  onSubmit,
  onBulkSubmit,
}: {
  videoForm: ReturnType<typeof emptyVideoForm>
  setVideoForm: Dispatch<SetStateAction<ReturnType<typeof emptyVideoForm>>>
  bulkVideoText: string
  setBulkVideoText: Dispatch<SetStateAction<string>>
  onSubmit: (event: FormEvent) => void
  onBulkSubmit: () => void
}) {
  return (
    <form onSubmit={onSubmit} style={panelStyle}>
      <SectionTitle icon={<Plus size={15} />} label="Viral intake" />
      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
        <select
          value={videoForm.platform}
          onChange={event => setVideoForm(prev => ({ ...prev, platform: event.target.value as GrowthPlatform }))}
          style={inputStyle}
          aria-label="Video platform"
        >
          {PLATFORMS.map(platform => (
            <option key={platform} value={platform}>
              {platformLabel[platform]}
            </option>
          ))}
        </select>
        <input value={videoForm.creatorHandle} onChange={event => setVideoForm(prev => ({ ...prev, creatorHandle: event.target.value }))} placeholder="Creator handle" style={inputStyle} />
        <input value={videoForm.url} onChange={event => setVideoForm(prev => ({ ...prev, url: event.target.value }))} placeholder="Video URL" style={inputStyle} />
        <input value={videoForm.hook} onChange={event => setVideoForm(prev => ({ ...prev, hook: event.target.value }))} placeholder="Opening hook" style={inputStyle} />
        <input value={videoForm.topic} onChange={event => setVideoForm(prev => ({ ...prev, topic: event.target.value }))} placeholder="Topic" style={inputStyle} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
          {(['views', 'likes', 'saves'] as const).map(field => (
            <input
              key={field}
              type="number"
              min="0"
              value={videoForm[field]}
              onChange={event => setVideoForm(prev => ({ ...prev, [field]: Number(event.target.value) }))}
              placeholder={field}
              style={inputStyle}
            />
          ))}
        </div>
        <button type="submit" style={buttonStyle}>
          <Plus size={14} /> Save video
        </button>
        <textarea
          value={bulkVideoText}
          onChange={event => setBulkVideoText(event.target.value)}
          style={{ ...textareaStyle, minHeight: '112px' }}
          aria-label="Bulk video import"
        />
        <button type="button" onClick={onBulkSubmit} style={quietButtonStyle}>
          Bulk import videos
        </button>
      </div>
    </form>
  )
}

function ApprovalQueue({
  packages,
  selectedId,
  onSelect,
}: {
  packages: PostPackage[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<Clock size={15} />} label="Approval queue" />
      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
        {packages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No packages staged.</div>
        ) : (
          packages.map(postPackage => (
            <button
              key={postPackage.id}
              type="button"
              onClick={() => onSelect(postPackage.id)}
              style={{
                ...quietButtonStyle,
                justifyContent: 'space-between',
                textAlign: 'left',
                borderColor: selectedId === postPackage.id ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{postPackage.ideaId}</span>
              <span style={badgeStyle(postPackage.approvalState === 'queued' ? 'offer' : postPackage.approvalState === 'blocked' ? 'archived' : 'sourcing')}>
                {postPackage.approvalState}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function AnalyticsPanel({
  state,
  analyticsText,
  setAnalyticsText,
  analyticsPreview,
  onPreviewAnalytics,
  onCommitAnalytics,
  onRunPlanning,
  onRunWatchlist,
  onRunAnalytics,
  onRunRecipeScoring,
  onRunRecommendations,
}: {
  state: GrowthOpsState
  analyticsText: string
  setAnalyticsText: Dispatch<SetStateAction<string>>
  analyticsPreview: GrowthAnalyticsImportRow[]
  onPreviewAnalytics: () => void
  onCommitAnalytics: () => void
  onRunPlanning: () => void
  onRunWatchlist: () => void
  onRunAnalytics: () => void
  onRunRecipeScoring: () => void
  onRunRecommendations: () => void
}) {
  const latest = state.metricSnapshots[0]
  const attributed = analyticsPreview.filter(row => row.attributed).length
  const quarantined = analyticsPreview.length - attributed
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<TrendUp size={15} />} label="Analytics" />
      <textarea
        value={analyticsText}
        onChange={event => setAnalyticsText(event.target.value)}
        style={{ ...textareaStyle, minHeight: '130px', marginTop: '10px' }}
        aria-label="Analytics CSV import"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
        <button type="button" onClick={onPreviewAnalytics} style={quietButtonStyle}>
          Preview import
        </button>
        <button type="button" onClick={onCommitAnalytics} style={buttonStyle}>
          Commit import
        </button>
      </div>
      {analyticsPreview.length > 0 ? (
        <div style={{ marginTop: '8px', display: 'grid', gap: '6px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Preview rows: {analyticsPreview.length} · attributed {attributed} · quarantine {quarantined}</div>
          {analyticsPreview.slice(0, 4).map(row => (
            <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '7px', color: 'var(--text-secondary)', fontSize: '11px' }}>
              {platformLabel[row.platform]} · {row.horizon} · {row.metrics.views} views · {row.attributed ? `mapped to ${row.postPackageId ?? row.ideaId ?? row.recipeId}` : row.quarantineReason}
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: '10px' }}>
        <button type="button" onClick={onRunPlanning} style={quietButtonStyle}>
          Calendar plan
        </button>
        <button type="button" onClick={onRunWatchlist} style={quietButtonStyle}>
          Watchlist refresh
        </button>
        <button type="button" onClick={onRunAnalytics} style={buttonStyle}>
          Owned analytics
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', marginTop: '8px' }}>
        <button type="button" onClick={onRunRecipeScoring} style={quietButtonStyle}>
          Score recipes
        </button>
        <button type="button" onClick={onRunRecommendations} style={quietButtonStyle}>
          Refresh recommendations
        </button>
      </div>
      <div style={{ marginTop: '9px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
        {latest ? `Latest ${platformLabel[latest.platform]} score ${growthMetricScore(latest.metrics)} · ${latest.horizon}.` : 'No owned snapshots yet.'}
      </div>
      <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
        {state.contentRecipes.slice(0, 3).map(recipe => (
          <div key={recipe.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
            <span>{truncate(recipe.name, 34)}</span>
            <span>{recipe.recommendation}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RunHistoryPanel({ runs }: { runs: GrowthAgentRun[] }) {
  return (
    <div style={panelStyle}>
      <SectionTitle icon={<FileVideo size={15} />} label="Run history" />
      <div style={{ display: 'grid', gap: '7px', marginTop: '9px' }}>
        {runs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No agent runs logged.</div>
        ) : (
          runs.slice(0, 6).map(run => (
            <div key={run.id} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--text-primary)' }}>{run.runType}</div>
                <span style={badgeStyle(run.status === 'completed' ? 'offer' : run.status === 'blocked' ? 'archived' : 'sourcing')}>{run.status}</span>
              </div>
              <div style={{ marginTop: '5px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.4 }}>
                Started {run.startedAt}
                {run.completedAt ? ` · Completed ${run.completedAt}` : ''}
                {run.blockedReason ? ` · ${run.blockedReason}` : ''}
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
                <span style={badgeStyle('sourcing')}>sources {JSON.stringify(run.sourceCounts)}</span>
                <span style={badgeStyle('applied')}>created {JSON.stringify(run.createdRecordCounts)}</span>
                <span style={badgeStyle('interviewing')}>updated {JSON.stringify(run.updatedRecordCounts)}</span>
              </div>
              {run.connectorStatuses.length > 0 ? (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {run.connectorStatuses.map(connector => (
                    <span key={connector.id} style={badgeStyle(connector.status === 'not_configured' ? 'archived' : 'sourcing')}>
                      {platformLabel[connector.platform]} {connector.status.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function WatchlistPanel({ state }: { state: GrowthOpsState }) {
  return (
    <div style={panelStyle}>
      <SectionTitle label="Watchlist" />
      <div style={{ display: 'grid', gap: '7px', marginTop: '9px' }}>
        {state.creatorWatchlist.map(creator => (
          <div key={creator.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '7px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 900 }}>{creator.displayName}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{creator.niche}</div>
            </div>
            <span style={badgeStyle('sourcing')}>{platformLabel[creator.platform]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionTitle({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 900, color: 'var(--text-primary)' }}>
      {icon}
      {label}
    </div>
  )
}
