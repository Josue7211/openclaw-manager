import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CaretLeft, CaretRight, Plus } from '@phosphor-icons/react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { useCrons } from '@/hooks/useCrons'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import type { CronJob, CronSchedule } from './crons/types'
import { FREQUENT_MS, navBtnStyle, getWeekStart, formatWeekLabel } from './crons/types'
import { FrequentBar } from './crons/FrequentBar'
import { WeekGrid } from './crons/WeekGrid'
import { JobList } from './crons/JobList'
import { CronFormModal } from './crons/CronFormModal'

export default function CronsPage() {
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <PageHeader defaultTitle="Cron Calendar" defaultSubtitle="automated routines · week view" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtnStyle}>
            <CaretLeft size={13} /> Prev
          </button>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '160px', textAlign: 'center' }}>
            {formatWeekLabel(weekStart)}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtnStyle}>
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
