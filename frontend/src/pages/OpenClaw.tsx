import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Robot, CaretLeft, CaretRight, Plus } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { GatewayStatusDot } from '@/components/GatewayStatusDot'
import { Button } from '@/components/ui/Button'
import { SkeletonList } from '@/components/Skeleton'
// Agent sub-components
import { useAgents } from '@/hooks/useAgents'
import { useTableRealtime } from '@/lib/hooks/useRealtimeSSE'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode, DEMO_AGENTS } from '@/lib/demo-data'
import { AgentList } from './agents/AgentList'
import { AgentDetailPanel } from './agents/AgentDetailPanel'
import type { Agent, AgentAction } from './agents/types'
// Cron sub-components
import { useCrons } from '@/hooks/useCrons'
import type { CronJob, CronSchedule } from './crons/types'
import { FREQUENT_MS, navBtnStyle, getWeekStart, formatWeekLabel } from './crons/types'
import { FrequentBar } from './crons/FrequentBar'
import { WeekGrid } from './crons/WeekGrid'
import { JobList } from './crons/JobList'
import { CronFormModal } from './crons/CronFormModal'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'

// Lazy-load new read-only tabs (not needed until clicked)
const UsageTab = lazy(() => import('./openclaw/UsageTab'))
const ModelsTab = lazy(() => import('./openclaw/ModelsTab'))
const ToolsTab = lazy(() => import('./openclaw/ToolsTab'))

type TabKey = 'agents' | 'crons' | 'usage' | 'models' | 'tools'

const tabDefs: { key: TabKey; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'crons', label: 'Crons' },
  { key: 'usage', label: 'Usage' },
  { key: 'models', label: 'Models' },
  { key: 'tools', label: 'Tools' },
]

function SectionFallback() {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</span>
    </div>
  )
}

// --- Agents Tab Content ---

function AgentsTabContent({ openclawHealthy }: { openclawHealthy: boolean }) {
  const _demo = isDemoMode()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listWidth, setListWidth] = useState(320)

  const { agents: realAgents, loading, createMutation, updateMutation, deleteMutation, actionMutation } = useAgents()
  const agents: Agent[] = _demo ? (DEMO_AGENTS as unknown as Agent[]) : realAgents

  // Real-time subscription via SSE
  useTableRealtime('agents', { queryKey: queryKeys.agents })

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null

  // Resize handle
  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = listWidth
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      setListWidth(Math.max(200, Math.min(startWidth + delta, 500)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [listWidth])

  const handleCreate = useCallback(() => {
    createMutation.mutate(
      { display_name: 'New Agent', emoji: '\uD83E\uDD16' },
      {
        onSuccess: (data) => {
          if (data?.agent?.id) setSelectedId(data.agent.id)
        },
      }
    )
  }, [createMutation])

  const handleUpdate = useCallback((id: string, fields: Partial<Agent>) => {
    updateMutation.mutate({ id, ...fields })
  }, [updateMutation])

  const handleDelete = useCallback((id: string) => {
    const idx = agents.findIndex((a) => a.id === id)
    const next = agents[idx + 1] ?? agents[idx - 1] ?? null
    deleteMutation.mutate(id)
    setSelectedId(next?.id ?? null)
  }, [agents, deleteMutation])

  const handleAction = useCallback((id: string, action: AgentAction) => {
    actionMutation.mutate({ id, action })
  }, [actionMutation])

  if (loading) {
    return (
      <div style={{ padding: '20px 28px' }}>
        <SkeletonList count={3} lines={4} layout="grid" />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left panel: agent list */}
      <div style={{
        width: listWidth, minWidth: listWidth,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <AgentList
          agents={agents}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={handleCreate}
        />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResize}
        style={{
          width: 4, cursor: 'col-resize',
          background: 'transparent', flexShrink: 0,
          marginLeft: -2, marginRight: -2, zIndex: 10,
          position: 'relative',
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent list"
      />

      {/* Right panel: detail or empty state */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedAgent ? (
          <AgentDetailPanel
            agent={selectedAgent}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAction={handleAction}
            openclawHealthy={openclawHealthy}
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
          }}>
            <Robot size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Select an agent to view settings
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Crons Tab Content ---

function CronsTabContent() {
  const { jobs, loading, createMutation, updateMutation, deleteMutation } = useCrons()

  const [weekOffset, setWeekOffset] = useState(0)
  const now = useRef(new Date()).current

  const [editingJob, setEditingJob] = useState<CronJob | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const dialogRef = useFocusTrap(confirmDeleteId !== null)
  useEscapeKey(() => setConfirmDeleteId(null), confirmDeleteId !== null)

  const baseWeekStart = getWeekStart(now)
  const weekStart = new Date(baseWeekStart)
  weekStart.setDate(weekStart.getDate() + weekOffset * 7)
  const isCurrentWeek = weekOffset === 0
  const todayDow = now.getDay()

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  // Partition: frequent jobs (< 1h) go to top bar, rest go to grid
  const frequentJobs = jobs.filter(
    j => j.schedule.kind === 'every' && j.schedule.everyMs && j.schedule.everyMs < FREQUENT_MS
  )
  const gridJobs = jobs.filter(
    j => !(j.schedule.kind === 'every' && j.schedule.everyMs && j.schedule.everyMs < FREQUENT_MS)
  )

  // CRUD handlers
  const handleCreateSave = (data: { name: string; schedule: CronSchedule; description?: string }) => {
    createMutation.mutate(data)
    setShowCreateModal(false)
  }

  const handleEditSave = (data: { name: string; schedule: CronSchedule; description?: string }) => {
    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, ...data })
      setEditingJob(null)
    }
  }

  const handleToggle = (id: string, enabled: boolean) => {
    updateMutation.mutate({ id, enabled })
  }

  const handleDeleteRequest = (id: string) => {
    setConfirmDeleteId(id)
  }

  const handleDeleteConfirm = () => {
    if (confirmDeleteId) {
      deleteMutation.mutate(confirmDeleteId)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '16px 20px', gap: '16px' }}>
      {/* Header row with week nav + create button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtnStyle} aria-label="Previous week">
            <CaretLeft size={13} /> Prev
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '160px', textAlign: 'center' }}>
            {formatWeekLabel(weekStart)}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtnStyle} aria-label="Next week">
            Next <CaretRight size={13} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            style={{
              ...navBtnStyle,
              background: isCurrentWeek ? 'var(--purple-a15)' : 'transparent',
              borderColor: isCurrentWeek ? 'var(--purple)' : 'var(--border-strong)',
              color: isCurrentWeek ? 'var(--purple)' : 'var(--text-secondary)',
            }}
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          aria-label="Create new cron job"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            color: 'var(--text-on-color)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <Plus size={14} weight="bold" /> New Job
        </button>
      </div>

      <FrequentBar frequentJobs={frequentJobs} allJobs={jobs} onJobClick={setEditingJob} />

      <WeekGrid
        gridJobs={gridJobs}
        allJobs={jobs}
        weekStart={weekStart}
        isCurrentWeek={isCurrentWeek}
        todayDow={todayDow}
        weekDays={weekDays}
        now={now}
        loading={loading}
        onJobClick={setEditingJob}
      />

      <JobList
        jobs={jobs}
        loading={loading}
        onEditJob={setEditingJob}
        onToggleJob={handleToggle}
        onDeleteJob={handleDeleteRequest}
      />

      {/* Create modal */}
      {showCreateModal && (
        <CronFormModal onSave={handleCreateSave} onClose={() => setShowCreateModal(false)} />
      )}

      {/* Edit modal */}
      {editingJob && (
        <CronFormModal job={editingJob} onSave={handleEditSave} onClose={() => setEditingJob(null)} />
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--overlay-heavy)' }}
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete cron job"
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-panel)', borderRadius: '12px', padding: '24px', width: '380px', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text-primary)' }}>
              Delete Cron Job
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{jobs.find(j => j.id === confirmDeleteId)?.name ?? 'this job'}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteConfirm}>Delete</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// --- Main OpenClaw Page ---

export default function OpenClawPage() {
  const [tab, setTab] = useState<TabKey>('agents')

  // Health check -- shared across all tabs
  const { data: healthData } = useQuery({
    queryKey: ['openclaw', 'health'],
    queryFn: () => api.get<{ ok: boolean; status: string }>('/api/openclaw/health'),
    staleTime: 30_000,
  })
  const healthy = healthData?.ok ?? false

  return (
    <div style={{
      position: 'absolute', inset: 0,
      margin: '-20px -28px',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header + tab bar */}
      <div style={{
        padding: '16px 20px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <PageHeader defaultTitle="OpenClaw" defaultSubtitle="agent management, usage & tools" />
          <GatewayStatusDot showLabel size={8} />
        </div>
        <div style={{
          display: 'flex', gap: '2px', marginTop: '12px',
          background: 'var(--bg-white-03)', borderRadius: '10px',
          padding: '3px', width: 'fit-content',
        }}>
          {tabDefs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '6px 14px',
                background: tab === t.key ? 'var(--purple-a15)' : 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: tab === t.key ? 'var(--accent-bright)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: tab === t.key ? 600 : 450,
                transition: 'all 0.15s var(--ease-spring)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tab === 'agents' && <AgentsTabContent openclawHealthy={healthy} />}
        {tab === 'crons' && <CronsTabContent />}
        {tab === 'usage' && (
          <Suspense fallback={<SectionFallback />}>
            <UsageTab healthy={healthy} />
          </Suspense>
        )}
        {tab === 'models' && (
          <Suspense fallback={<SectionFallback />}>
            <ModelsTab healthy={healthy} />
          </Suspense>
        )}
        {tab === 'tools' && (
          <Suspense fallback={<SectionFallback />}>
            <ToolsTab healthy={healthy} />
          </Suspense>
        )}
      </div>
    </div>
  )
}
